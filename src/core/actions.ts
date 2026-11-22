import {
  B, CUSTOM_EFFECT_CAT, CUSTOM_TERRAINS, DISTRICT_NAMES, INFRA, P, POLICIES, registerCustomBuilding, unregisterCustomBuilding,
  type BuildingDef, type Cat, type CustomEffect,
} from './content';
import { neighborsOf } from './hex';
import { REFERENDUMS, referendumYes, runReferendum } from './elections';
import { computeMetrics, endTurn } from './sim';
import { inTerritory, pushLog } from './state';
import type { GameState, Infra, Terrain, Zone } from './types';

export interface Result {
  ok: boolean;
  msg: string;
}
const ok = (msg = ''): Result => ({ ok: true, msg });
const ko = (msg: string): Result => ({ ok: false, msg });

const TERRAIN_COST: Record<Terrain, number> = { plain: 1, forest: 1.2, hill: 1.3, mountain: 2.5, water: 4 };

const ZONE_CATS: Record<Zone, Cat[] | 'all'> = {
  free: 'all',
  residential: ['logement', 'education', 'sante', 'securite', 'culture', 'environnement', 'transport', 'admin'],
  economic: ['economie', 'finance', 'transport', 'education', 'sante', 'securite', 'culture', 'environnement', 'energie'],
  industrial: ['economie', 'energie', 'transport', 'environnement'],
  nature: [],
  agri: [],
};

export const ZONE_LABEL: Record<Zone, string> = {
  free: 'Libre',
  residential: 'Résidentielle',
  economic: 'Économique',
  industrial: 'Industrielle',
  nature: 'Naturelle protégée',
  agri: 'Agricole',
};

export const ZONE_COLOR: Record<Zone, string> = {
  free: 'transparent',
  residential: 'rgba(80,160,255,0.35)',
  economic: 'rgba(255,200,60,0.38)',
  industrial: 'rgba(170,100,200,0.38)',
  nature: 'rgba(40,170,80,0.42)',
  agri: 'rgba(200,170,90,0.4)',
};

export function highwayAllowed(s: GameState): boolean {
  return s.level >= 1 || s.sandbox || (s.unlocks.highway ?? 0) > s.turn;
}

export function buildCost(s: GameState, id: string, idx: number): number {
  const def = B[id];
  const t = s.tiles[idx];
  const m = t.terrain === 'hill' ? 1.15 : t.terrain === 'forest' && id !== 'parc' ? 1.1 : 1;
  return Math.round(def.cost * s.macro.costIndex * m);
}

export function infraCost(s: GameState, kind: Exclude<Infra, 'none'>, idx: number): number {
  return Math.round(INFRA[kind].cost * TERRAIN_COST[s.tiles[idx].terrain] * s.macro.costIndex);
}

function frozen(s: GameState): Result | null {
  return s.cohabitation ? ko('Cohabitation : la majorité du conseil bloque cette décision jusqu’aux prochaines élections.') : null;
}

export function canBuildBuilding(s: GameState, id: string, idx: number): Result {
  const def = B[id];
  const t = s.tiles[idx];
  if (!def) return ko('Bâtiment inconnu.');
  if (!(def.modes ?? ['city']).includes(s.park ? 'park' : 'city')) return ko('Indisponible dans ce mode de jeu.');
  if (!inTerritory(s, idx)) return ko('Hors de votre territoire.');
  if (def.level > s.level && !s.sandbox) return ko(`Débloqué à l’échelle ${['communale', 'régionale', 'nationale'][def.level]}.`);
  if (t.building) return ko('Cette tuile est déjà occupée.');
  if (t.infra !== 'none') return ko('Une infrastructure occupe cette tuile.');
  if (!def.terrains.includes(t.terrain)) return ko('Terrain inadapté pour ce bâtiment.');
  const zc = ZONE_CATS[t.zone];
  if (zc !== 'all') {
    const allowedNature = t.zone === 'nature' && (id === 'parc' || id === 'bio');
    const allowedAgri = t.zone === 'agri' && (def.id === 'ferme' || def.id === 'bio' || def.id === 'parc');
    if (!zc.includes(def.cat) && !allowedNature && !allowedAgri) return ko(`Zone « ${ZONE_LABEL[t.zone]} » : construction non permise. Modifiez le plan d’urbanisme.`);
  }
  if (def.unique) {
    const exists = s.tiles.some((x) => x.building === id);
    if (exists) return ko('Un seul exemplaire est possible.');
  }
  const c = buildCost(s, id, idx);
  if (c > s.treasury) return ko(`Fonds insuffisants (${c} k€ requis).`);
  return ok();
}

export function buildBuilding(s: GameState, idx: number, id: string): Result {
  const f = frozen(s);
  if (f) return f;
  const r = canBuildBuilding(s, id, idx);
  if (!r.ok) return r;
  const def = B[id];
  s.treasury -= buildCost(s, id, idx);
  const t = s.tiles[idx];
  t.building = id;
  t.build = def.turns;
  if (t.terrain === 'forest' && id !== 'parc') t.terrain = 'plain';
  return ok(def.turns > 0 ? `${def.name} : ${def.turns} trimestre(s) de travaux.` : `${def.name} construit.`);
}

export function buildInfra(s: GameState, idx: number, kind: Exclude<Infra, 'none'>): Result {
  const f = frozen(s);
  if (f) return f;
  const t = s.tiles[idx];
  if (!inTerritory(s, idx)) return ko('Hors de votre territoire.');
  if (t.building) return ko('Un bâtiment occupe cette tuile.');
  if (t.infra === kind) return ko('Déjà aménagé.');
  if (kind === 'highway' && !highwayAllowed(s)) return ko('Autoroutes indisponibles à l’échelle communale (sauf référendum favorable).');
  if (INFRA[kind].level > s.level && kind !== 'highway') return ko('Pas encore disponible.');
  const c = infraCost(s, kind, idx);
  if (c > s.treasury) return ko(`Fonds insuffisants (${c} k€ requis).`);
  s.treasury -= c;
  t.infra = kind;
  return ok();
}

export function demolish(s: GameState, idx: number): Result {
  const f = frozen(s);
  if (f) return f;
  const t = s.tiles[idx];
  if (!inTerritory(s, idx)) return ko('Hors de votre territoire.');
  if (t.building === 'mairie') return ko('On ne démolit pas la mairie.');
  if (!t.building && t.infra === 'none') return ko('Rien à démolir.');
  const cost = Math.round(5 * s.macro.costIndex);
  if (cost > s.treasury) return ko('Fonds insuffisants.');
  s.treasury -= cost;
  t.building = null;
  t.build = 0;
  t.infra = 'none';
  return ok();
}

export function setZone(s: GameState, idx: number, zone: Zone): Result {
  const f = frozen(s);
  if (f) return f;
  const t = s.tiles[idx];
  if (!inTerritory(s, idx)) return ko('Hors de votre territoire.');
  if (t.zone === zone) return ko('Déjà dans cette zone.');
  if (zone === 'nature' && t.building) return ko('Un bâtiment est déjà présent : démolissez-le d’abord.');
  const cost = Math.round(1.5 * s.macro.costIndex);
  if (cost > s.treasury) return ko('Fonds insuffisants.');
  s.treasury -= cost;
  t.zone = zone;
  return ok();
}

export function plantForest(s: GameState, idx: number): Result {
  const f = frozen(s);
  if (f) return f;
  const t = s.tiles[idx];
  if (!inTerritory(s, idx)) return ko('Hors de votre territoire.');
  if (t.building || t.infra !== 'none') return ko('Tuile occupée.');
  if (t.terrain !== 'plain' && t.terrain !== 'hill') return ko('Seules les plaines et collines se reboisent.');
  const cost = Math.round(20 * s.macro.costIndex);
  if (cost > s.treasury) return ko(`Fonds insuffisants (${cost} k€).`);
  s.treasury -= cost;
  t.terrain = 'forest';
  return ok('Reboisement effectué.');
}

// ---------------------------------------------------------------- Finances

export function setRate(s: GameState, key: 'income' | 'corp' | 'property' | 'transit' | 'toll' | 'entry' | 'plane', v: number): Result {
  const f = frozen(s);
  if (f) return f;
  if (key === 'transit') s.rates.transit = Math.max(0, Math.min(40, Math.round(v)));
  else if (key === 'toll') s.rates.toll = Math.max(0, Math.min(5, Math.round(v * 10) / 10));
  else if (key === 'entry') s.rates.entry = Math.max(0, Math.min(50, Math.round(v)));
  else if (key === 'plane') s.rates.plane = Math.max(0, Math.min(150, Math.round(v)));
  else s.rates[key] = Math.max(0, Math.min(30, Math.round(v)));
  return ok();
}

export function setFunding(s: GameState, key: string, v: number): Result {
  const f = frozen(s);
  if (f) return f;
  if (!(key in s.funding)) return ko('Ligne inconnue.');
  s.funding[key] = Math.max(0.5, Math.min(1.5, Math.round(v * 20) / 20));
  return ok();
}

export function takeLoan(s: GameState, amount: number, term: number): Result {
  const m = computeMetrics(s);
  if (m.banks === 0) return ko('Il faut au moins une banque pour emprunter.');
  if (amount <= 0) return ko('Montant invalide.');
  if (amount > m.creditAvailable) return ko(`Plafond de crédit atteint (${Math.floor(m.creditAvailable)} k€ disponibles).`);
  s.loans.push({ id: s.nextId++, amount0: amount, balance: amount, rate: m.loanRate, term, termLeft: term });
  s.treasury += amount;
  return ok(`Emprunt de ${amount} k€ à ${m.loanRate.toFixed(2)} % sur ${term} trimestres.`);
}

export function repayLoan(s: GameState, loanId: number): Result {
  const l = s.loans.find((x) => x.id === loanId);
  if (!l) return ko('Prêt introuvable.');
  if (l.balance > s.treasury) return ko('Fonds insuffisants pour rembourser.');
  s.treasury -= l.balance;
  s.loans = s.loans.filter((x) => x.id !== loanId);
  return ok('Prêt remboursé par anticipation.');
}

export function setPolicyRate(s: GameState, v: number): Result {
  const f = frozen(s);
  if (f) return f;
  const m = computeMetrics(s);
  if (s.level < 2 || (m.counts.banque_centrale ?? 0) === 0) return ko('Il faut une Banque centrale (échelle nationale).');
  s.policyRate = Math.max(0, Math.min(8, Math.round(v * 4) / 4));
  return ok();
}

// ---------------------------------------------------------------- Politiques & institutions

export function enactPolicy(s: GameState, id: string): Result {
  const f = frozen(s);
  if (f) return f;
  const p = P[id];
  if (!p) return ko('Mesure inconnue.');
  if (s.policies.includes(id)) return ko('Déjà en vigueur.');
  if (p.level > s.level) return ko('Pas encore disponible à cette échelle.');
  s.policies.push(id);
  pushLog(s, 'info', `Mesure adoptée : ${p.name}.`);
  return ok();
}

export function repealPolicy(s: GameState, id: string): Result {
  const f = frozen(s);
  if (f) return f;
  if (!s.policies.includes(id)) return ko('Mesure non adoptée.');
  s.policies = s.policies.filter((x) => x !== id);
  pushLog(s, 'info', `Mesure abrogée : ${P[id].name}.`);
  return ok();
}

export function setSetting<K extends 'voteSystem' | 'mandateQ' | 'ric'>(s: GameState, key: K, v: GameState['settings'][K]): Result {
  const f = frozen(s);
  if (f) return f;
  s.settings[key] = v;
  if (key === 'mandateQ') s.nextElection = Math.max(s.turn + 2, Math.min(s.nextElection, s.turn + (v as number)));
  return ok();
}

export function setCampaign(s: GameState, v: number): Result {
  s.campaign = Math.max(0, Math.min(Math.floor(Math.max(0, s.treasury)), Math.round(v)));
  return ok();
}

export function hostReferendum(s: GameState, id: string): Result {
  const f = frozen(s);
  if (f) return f;
  const tpl = REFERENDUMS.find((r) => r.id === id);
  if (!tpl) return ko('Référendum inconnu.');
  if (s.turn - s.lastReferendum < 2) return ko('Un référendum tous les 2 trimestres au maximum.');
  const c = Math.round(tpl.cost * s.macro.costIndex);
  if (c > s.treasury) return ko('Fonds insuffisants pour organiser le scrutin.');
  s.treasury -= c;
  const r = runReferendum(s, computeMetrics(s), tpl);
  return { ok: true, msg: `${(r.yes * 100).toFixed(1)} % de oui — ${r.effect}` };
}

export function previewReferendum(s: GameState, id: string): number {
  const tpl = REFERENDUMS.find((r) => r.id === id)!;
  const saved = s.rng;
  const y = referendumYes(s, computeMetrics(s), tpl);
  s.rng = saved;
  return y;
}

/** Budget participatif : le quartier concerné vote pour son projet ; il est construit sur une tuile libre du secteur. */
export function fundProposal(s: GameState, proposalId: number): Result {
  const p = s.proposals.find((x) => x.id === proposalId);
  if (!p) return ko('Proposition introuvable.');
  if (p.cost > s.treasury) return ko(`Fonds insuffisants (${p.cost} k€).`);
  const def = B[p.building];
  const W = s.W, H = s.H;
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    if (t.district !== p.district || !inTerritory(s, i)) continue;
    if (t.building || t.infra !== 'none' || !def.terrains.includes(t.terrain)) continue;
    if (!canBuildBuilding({ ...s, treasury: 1e9 } as GameState, p.building, i).ok) continue;
    const near = neighborsOf(i, W, H).some((j) => s.tiles[j].infra === 'road' || s.tiles[j].infra === 'highway' || s.tiles[j].building);
    const sc = near ? 2 : 1;
    if (sc > bestScore) {
      best = i;
      bestScore = sc;
    }
  }
  if (best < 0) return ko('Aucune tuile disponible dans ce secteur.');
  s.treasury -= p.cost;
  const t = s.tiles[best];
  t.building = p.building;
  t.build = def.turns;
  if (t.terrain === 'forest' && p.building !== 'parc') t.terrain = 'plain';
  s.proposals = [];
  s.satisfaction = Math.min(100, s.satisfaction + 2.5);
  pushLog(s, 'good', `Projet citoyen réalisé : ${def.name} (${p.title.split('—')[1]?.trim() ?? ''}).`);
  return ok('Projet citoyen lancé !');
}

export function dismissProposals(s: GameState): Result {
  s.proposals = [];
  return ok();
}

const MAX_CUSTOM_BUILDINGS = 12;
const MIN_CUSTOM_COST = 1000; // k€ (1 M€)
const MAX_CUSTOM_COST = 50000;
const CUSTOM_BUILD_TURNS = 3;

export interface CustomBuildingInput {
  name: string;
  icon: string;
  effect: CustomEffect;
  magnitude: number;
  cost: number;
}

function applyCustomEffect(def: BuildingDef, effect: CustomEffect, mag: number, park: boolean) {
  switch (effect) {
    case 'capacity':
      if (park) { def.rideCapacity = mag; def.thrill = 0.3; }
      else def.housing = mag;
      break;
    case 'econ':
      def.jobs = Math.min(300, mag);
      def.prod = Math.max(0.5, Math.round(def.jobs * 0.12 * 10) / 10);
      break;
    case 'health': def.health = mag; break;
    case 'safety': def.safety = mag; break;
    case 'culture': def.culture = mag; break;
    case 'green': def.green = Math.max(0.1, Math.min(5, mag / 50)); break;
    case 'energy': def.supply = mag; break;
    case 'transit': def.transit = mag; break;
  }
}

function buildCustomDef(s: GameState, id: string, input: CustomBuildingInput): BuildingDef {
  const name = input.name.trim().slice(0, 40) || 'Bâtiment personnalisé';
  const icon = input.icon.trim().slice(0, 4) || '🏗️';
  const cost = Math.max(MIN_CUSTOM_COST, Math.min(MAX_CUSTOM_COST, Math.round(input.cost) || 0));
  const mag = Math.max(1, Math.round(input.magnitude) || 0);
  const def: BuildingDef = {
    id, name, icon, cat: CUSTOM_EFFECT_CAT[input.effect][s.park ? 'park' : 'city'],
    desc: `Bâtiment personnalisé.`, cost, upkeep: Math.max(1, Math.round(cost / 20)),
    level: 0, turns: CUSTOM_BUILD_TURNS, terrains: CUSTOM_TERRAINS,
    modes: [s.park ? 'park' : 'city'], customEffect: input.effect, customMagnitude: mag,
  };
  applyCustomEffect(def, input.effect, mag, s.park);
  return def;
}

/** Crée un bâtiment personnalisé et l'ajoute au catalogue de la barre d'outils (pour cette partie). Coût ≥ 1 M€, chantier de 3 trimestres. */
export function createCustomBuilding(s: GameState, input: CustomBuildingInput): Result {
  const f = frozen(s);
  if (f) return f;
  if (s.customBuildings.length >= MAX_CUSTOM_BUILDINGS) return ko(`${MAX_CUSTOM_BUILDINGS} bâtiments personnalisés au maximum.`);
  const id = `custom_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`;
  const def = buildCustomDef(s, id, input);
  registerCustomBuilding(def);
  s.customBuildings.push(def);
  pushLog(s, 'info', `Nouveau bâtiment personnalisé disponible : ${def.icon} ${def.name}.`);
  return ok(`${def.icon} ${def.name} ajouté à la barre d’outils !`);
}

/** Modifie un bâtiment personnalisé existant (les exemplaires déjà construits reprennent ses nouvelles caractéristiques). */
export function updateCustomBuilding(s: GameState, id: string, input: CustomBuildingInput): Result {
  const f = frozen(s);
  if (f) return f;
  const i = s.customBuildings.findIndex((b) => b.id === id);
  if (i < 0) return ko('Bâtiment personnalisé introuvable.');
  const def = buildCustomDef(s, id, input);
  registerCustomBuilding(def);
  s.customBuildings[i] = def;
  pushLog(s, 'info', `Bâtiment personnalisé modifié : ${def.icon} ${def.name}.`);
  return ok(`${def.icon} ${def.name} mis à jour !`);
}

/** Supprime un type de bâtiment personnalisé du catalogue (impossible tant qu'un exemplaire est encore construit). */
export function deleteCustomBuilding(s: GameState, id: string): Result {
  const f = frozen(s);
  if (f) return f;
  const i = s.customBuildings.findIndex((b) => b.id === id);
  if (i < 0) return ko('Bâtiment personnalisé introuvable.');
  if (s.tiles.some((t) => t.building === id)) return ko('Démolissez tous les exemplaires déjà construits avant de supprimer ce type de bâtiment.');
  const def = s.customBuildings[i];
  s.customBuildings.splice(i, 1);
  unregisterCustomBuilding(id);
  pushLog(s, 'info', `Bâtiment personnalisé supprimé : ${def.icon} ${def.name}.`);
  return ok(`${def.icon} ${def.name} supprimé.`);
}

const MAX_FUNDRAISERS = 3;

/** Cagnotte citoyenne : les habitants du secteur cotisent au fil des trimestres pour financer un bâtiment, sans toucher à la trésorerie. */
export function startFundraiser(s: GameState, building: string, district: number): Result {
  const f = frozen(s);
  if (f) return f;
  const def = B[building];
  if (!def) return ko('Bâtiment inconnu.');
  if (building === 'mairie') return ko('La mairie ne peut pas être financée par une cagnotte.');
  if (def.level > s.level && !s.sandbox) return ko(`Débloqué à l’échelle ${['communale', 'régionale', 'nationale'][def.level]}.`);
  if (def.unique && s.tiles.some((t) => t.building === building)) return ko('Un seul exemplaire est possible.');
  if (district < 0 || district > 6) return ko('Secteur invalide.');
  if (s.fundraisers.length >= MAX_FUNDRAISERS) return ko(`${MAX_FUNDRAISERS} cagnottes au maximum en même temps.`);
  const goal = Math.round(def.cost * s.macro.costIndex);
  s.fundraisers.push({ id: s.nextId++, building, district, goal, raised: 0 });
  pushLog(s, 'info', `Cagnotte citoyenne lancée pour ${def.icon} ${def.name} (secteur ${DISTRICT_NAMES[district]}, objectif ${goal} k€).`);
  return ok('Cagnotte lancée !');
}

export function cancelFundraiser(s: GameState, id: number): Result {
  const f = frozen(s);
  if (f) return f;
  const fr = s.fundraisers.find((x) => x.id === id);
  if (!fr) return ko('Cagnotte introuvable.');
  s.fundraisers = s.fundraisers.filter((x) => x.id !== id);
  pushLog(s, 'info', `Cagnotte annulée : ${B[fr.building].name}.`);
  return ok();
}

export function levelUp(s: GameState): Result {
  if (!s.levelReady || s.level >= 2) return ko('Les conditions ne sont pas remplies.');
  s.level = (s.level + 1) as 0 | 1 | 2;
  s.levelReady = false;
  s.levelStreak = 0;
  s.nextElection = s.turn + 4;
  s.cohabitation = false;
  s.macro.baseRate = s.macro.baseRate;
  pushLog(s, 'good', s.level === 1
    ? 'Passage à l’échelle régionale : votre territoire s’agrandit, de nouvelles compétences s’ouvrent. Des élections régionales auront lieu dans 4 trimestres.'
    : 'Passage à l’échelle nationale ! Banque centrale, grands projets et parlement sont à votre portée. Élections législatives dans 4 trimestres.');
  return ok();
}

export { endTurn, POLICIES };
