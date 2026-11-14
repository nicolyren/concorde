import { LEVEL_ASSEMBLY, LEVEL_EXEC, LEVEL_SEATS, P } from './content';
import { gauss } from './rng';
import { pushLog } from './state';
import type { ElectionResult, GameState, Metrics, RefResult } from './types';
import { DISTRICT_NAMES } from './content';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return d / (Math.sqrt(na * nb) || 1);
}

export function districtProblems(s: GameState, m: Metrics, d: number): number[] {
  const delta = m.districts[d].delta;
  const i = m.idx;
  const localEnv = clamp(i.env + delta * 1.2, 0, 100);
  const taxLoad = (s.rates.income + s.rates.corp + s.rates.property) / 60;
  return [
    (100 - localEnv) / 100,
    1 - (i.employment + i.housing + i.health) / 300,
    clamp(taxLoad * 1.3 + (100 - i.energy) / 200, 0, 1),
    1 - i.safety / 100,
    1 - (i.mobility + i.culture) / 200,
  ];
}

export function dHondt(votes: Record<string, number>, seats: number, threshold = 0.05): Record<string, number> {
  const total = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
  const eligible = Object.entries(votes).filter(([, v]) => v / total >= threshold);
  const out: Record<string, number> = {};
  for (const [id] of Object.entries(votes)) out[id] = 0;
  if (eligible.length === 0 || seats <= 0) return out;
  for (let k = 0; k < seats; k++) {
    let best = eligible[0][0];
    let bestQ = -1;
    for (const [id, v] of eligible) {
      const q = v / (out[id] + 1);
      if (q > bestQ) {
        bestQ = q;
        best = id;
      }
    }
    out[best]++;
  }
  return out;
}

function softmax(scores: Record<string, number>, tau: number): Record<string, number> {
  const ids = Object.keys(scores);
  const mx = Math.max(...ids.map((k) => scores[k]));
  const ex = ids.map((k) => Math.exp((scores[k] - mx) / tau));
  const sum = ex.reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  ids.forEach((k, j) => (out[k] = ex[j] / sum));
  return out;
}

export function districtShares(s: GameState, m: Metrics, d: number, campaignBonus: number): Record<string, number> {
  const w = s.districtW[d];
  const pr = districtProblems(s, m, d);
  const scores: Record<string, number> = {};
  const approval = clamp(s.satisfaction + m.districts[d].delta, 0, 100) / 100;
  scores.player = 1.7 * Math.pow(approval, 1.0) + 0.5 * cosine(s.playerList.ideo, w) + campaignBonus + 0.05;
  for (const p of s.parties) {
    let sc = 0;
    for (let k = 0; k < 5; k++) sc += p.ideo[k] * w[k] * pr[k];
    sc = 1.2 * sc + 0.5 * cosine(p.ideo, w) + 0.08 * gauss(s);
    for (const id of s.policies) {
      const pol = P[id];
      if (!pol) continue;
      if (pol.likes.includes(p.id)) sc -= 0.07;
      if (pol.dislikes.includes(p.id)) sc += 0.07;
    }
    scores[p.id] = sc;
  }
  return softmax(scores, 0.35);
}

export function campaignBonus(s: GameState, spent: number): number {
  return 0.25 * (1 - Math.exp(-spent / (300 * (1 + s.level))));
}

function ideoOf(s: GameState, id: string): number[] {
  if (id === 'player') return s.playerList.ideo;
  return s.parties.find((p) => p.id === id)!.ideo;
}

export function listName(s: GameState, id: string): string {
  if (id === 'player') return s.playerList.name;
  return s.parties.find((p) => p.id === id)?.name ?? id;
}

export function listColor(s: GameState, id: string): string {
  if (id === 'player') return s.playerList.color;
  return s.parties.find((p) => p.id === id)?.color ?? '#888';
}

export function runElection(s: GameState, m: Metrics): ElectionResult {
  const spent = Math.min(s.campaign, Math.max(0, s.treasury));
  s.treasury -= spent;
  s.campaign = 0;
  const bonus = campaignBonus(s, spent);

  const ids = ['player', ...s.parties.map((p) => p.id)];
  const perDistrict: Record<string, number>[] = [];
  const totals: Record<string, number> = Object.fromEntries(ids.map((k) => [k, 0]));
  for (let d = 0; d < 7; d++) {
    const sh = districtShares(s, m, d, bonus);
    perDistrict.push(sh);
    for (const k of ids) totals[k] += sh[k] * m.districts[d].share;
  }
  const rounds: { round: number; shares: Record<string, number> }[] = [{ round: 1, shares: { ...totals } }];
  const system = s.settings.voteSystem;
  const total = LEVEL_SEATS[s.level];
  const sorted = [...ids].sort((a, b) => totals[b] - totals[a]);
  let winner = sorted[0];
  let seats: Record<string, number>;
  let coalition: string | undefined;

  if (system === 'majoritaire') {
    if (totals[winner] <= 0.5) {
      const [a, b] = sorted;
      const r2: Record<string, number> = { [a]: totals[a], [b]: totals[b] };
      for (const k of sorted.slice(2)) {
        const wa = Math.exp(3 * cosine(ideoOf(s, k), ideoOf(s, a)));
        const wb = Math.exp(3 * cosine(ideoOf(s, k), ideoOf(s, b)));
        r2[a] += totals[k] * 0.8 * (wa / (wa + wb));
        r2[b] += totals[k] * 0.8 * (wb / (wa + wb));
      }
      const sum = r2[a] + r2[b];
      r2[a] /= sum;
      r2[b] /= sum;
      rounds.push({ round: 2, shares: r2 });
      winner = r2[a] >= r2[b] ? a : b;
    }
    const bonusSeats = Math.floor(total / 2);
    seats = dHondt(totals, total - bonusSeats);
    seats[winner] += bonusSeats;
  } else {
    seats = dHondt(totals, total);
    winner = Object.keys(seats).sort((a, b) => seats[b] - seats[a])[0];
    if (seats[winner] * 2 <= total) {
      // Coalition avec la liste idéologiquement la plus proche, tant qu'elle atteint la majorité
      const others = Object.keys(seats).filter((k) => k !== winner && seats[k] > 0)
        .sort((a, b) => cosine(ideoOf(s, b), ideoOf(s, winner)) - cosine(ideoOf(s, a), ideoOf(s, winner)));
      let acc = seats[winner];
      const partners: string[] = [];
      for (const k of others) {
        partners.push(k);
        acc += seats[k];
        if (acc * 2 > total) break;
      }
      coalition = partners.map((k) => listName(s, k)).join(' + ');
    }
  }

  const playerWon = winner === 'player';
  const title = ['Élections municipales', 'Élections régionales', 'Élections législatives'][s.level];
  const result: ElectionResult = {
    turn: s.turn, level: s.level, system, title, rounds,
    districts: perDistrict.map((sh, d) => ({ name: d === 0 ? 'Centre' : 'Secteur ' + DISTRICT_NAMES[d], shares: sh })),
    seats, totalSeats: total, winner, playerWon, coalition, wellbeingAtVote: m.wellbeing,
  };
  s.lastElection = result;
  s.councilSeats = seats;
  s.cohabitation = !playerWon;
  s.nextElection = s.turn + s.settings.mandateQ;
  const finalShare = rounds[rounds.length - 1].shares.player ?? 0;
  s.electionHistory.push({ turn: s.turn, level: s.level, winner, playerShare: finalShare, playerWon });
  if (playerWon) {
    s.satisfaction = clamp(s.satisfaction + 3, 0, 100);
    pushLog(s, 'vote', `${title} : ${s.playerList.name} l’emporte avec ${(finalShare * 100).toFixed(1)} % et ${seats.player} sièges sur ${total}. Nouveau mandat de ${LEVEL_EXEC[s.level]}.`);
  } else {
    pushLog(s, 'vote', `${title} : ${listName(s, winner)} l’emporte. ${s.playerList.name} conserve ${seats.player} sièges au ${LEVEL_ASSEMBLY[s.level].toLowerCase()} : cohabitation jusqu’aux prochaines élections (impôts, lois et institutions sont gelés).`);
  }
  return result;
}

// ---------------------------------------------------------------- Référendums

export interface RefTemplate {
  id: string;
  title: string;
  question: string;
  /** sensibilité (−1..+1) sur [écologie, social, économie, ordre, vie locale] */
  stance: number[];
  cost: number;
  level: number;
  describe: string;
}

export const REFERENDUMS: RefTemplate[] = [
  { id: 'taxe_verte', title: 'Taxe verte', question: 'Faut-il instaurer une taxe verte (+2 points d’impôt sur les entreprises) pour financer la transition écologique ?', stance: [0.9, 0.2, -0.8, 0, 0.1], cost: 40, level: 0, describe: 'Si oui : +2 pts d’impôt sociétés et une dotation d’investissement.' },
  { id: 'autoroute', title: 'Autoroute urbaine', question: 'Faut-il autoriser la construction d’une autoroute urbaine ?', stance: [-0.9, -0.1, 0.6, 0, 0.5], cost: 40, level: 0, describe: 'Si oui : autoroutes autorisées pendant 16 trimestres, avec 300 k€ de subvention.' },
  { id: 'emprunt_citoyen', title: 'Emprunt citoyen', question: 'Faut-il lancer un emprunt citoyen pour financer des équipements ?', stance: [0.2, 0.5, -0.3, 0, 0.3], cost: 40, level: 0, describe: 'Si oui : emprunt à taux réduit, sans passer par une banque.' },
  { id: 'transports_gratuits', title: 'Gratuité des transports', question: 'Faut-il rendre les transports en commun gratuits ?', stance: [0.7, 0.8, -0.7, -0.1, 0.5], cost: 40, level: 0, describe: 'Si oui : la mesure est adoptée sans frais de procédure.' },
  { id: 'protection_nature', title: 'Sanctuaire naturel', question: 'Faut-il sanctuariser les espaces naturels du territoire ?', stance: [1.0, 0.1, -0.5, 0.1, 0.6], cost: 40, level: 0, describe: 'Si oui : la mesure « Protection des espaces naturels » est adoptée.' },
  { id: 'budget_participatif', title: 'Budget participatif', question: 'Faut-il créer un budget participatif piloté par les habitants ?', stance: [0.5, 0.6, -0.1, -0.1, 0.5], cost: 40, level: 0, describe: 'Si oui : le budget participatif est adopté.' },
];

export function referendumYes(s: GameState, m: Metrics, tpl: RefTemplate): number {
  let yes = 0;
  for (let d = 0; d < 7; d++) {
    const w = s.districtW[d];
    let z = 0;
    for (let k = 0; k < 5; k++) z += w[k] * tpl.stance[k] * 0.6;
    z += ((s.satisfaction - 50) / 50) * 0.9 + 0.2 * gauss(s) + (tpl.stance[2] > 0 ? 0 : 0.1);
    yes += m.districts[d].share * (1 / (1 + Math.exp(-1.8 * z)));
  }
  return yes;
}

export function runReferendum(s: GameState, m: Metrics, tpl: RefTemplate): RefResult {
  const yes = referendumYes(s, m, tpl);
  const passed = yes > 0.5;
  let effect = 'Statu quo : la proposition est rejetée.';
  if (passed) {
    const scale = 1 + s.level;
    switch (tpl.id) {
      case 'taxe_verte':
        s.rates.corp = Math.min(30, s.rates.corp + 2);
        s.treasury += 400 * scale;
        effect = `Adoptée : impôt sociétés à ${s.rates.corp} % et dotation de ${400 * scale} k€.`;
        break;
      case 'autoroute':
        s.unlocks.highway = s.turn + 16;
        s.treasury += 300 * scale;
        effect = `Adoptée : autoroutes autorisées 16 trimestres, subvention de ${300 * scale} k€.`;
        break;
      case 'emprunt_citoyen': {
        const amount = 800 * scale;
        s.loans.push({ id: s.nextId++, amount0: amount, balance: amount, rate: 0.5, term: 16, termLeft: 16 });
        s.treasury += amount;
        effect = `Adoptée : ${amount} k€ empruntés à 0,5 % sur 16 trimestres.`;
        break;
      }
      case 'transports_gratuits':
      case 'protection_nature':
      case 'budget_participatif':
        if (!s.policies.includes(tpl.id)) s.policies.push(tpl.id);
        effect = `Adoptée : « ${P[tpl.id].name} » entre en vigueur.`;
        break;
    }
  }
  s.satisfaction = clamp(s.satisfaction + 2 + (Math.abs(yes - 0.5) > 0.2 ? 1 : 0), 0, 100);
  const res: RefResult = { turn: s.turn, id: tpl.id, title: tpl.title, yes, passed, effect };
  s.referendums.push(res);
  s.lastReferendum = s.turn;
  pushLog(s, 'vote', `Référendum « ${tpl.title} » : ${(yes * 100).toFixed(1)} % de oui. ${effect}`);
  return res;
}
