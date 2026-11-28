import {
  B, FUNDING_KEY, P, DISTRICT_NAMES, LEVEL_POP_GOAL, LEVEL_WB_GOAL,
  BUS_UPKEEP, TRAIN_UPKEEP, BUSES_PER_DEPOT, TRAINS_PER_LINE, type BuildingDef,
} from './content';
import { neighborsOf } from './hex';
import { rand, gauss } from './rng';
import { pushLog, inTerritory, territoryRadius } from './state';
import type { DistrictInfo, GameState, Metrics } from './types';
import { runElection } from './elections';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const eff = (f: number) => Math.min(1.15, 0.55 + 0.45 * f);

const NB_CACHE = new Map<number, number[][]>();
export function nbs(W: number, H: number): number[][] {
  const key = W * 1000 + H;
  let v = NB_CACHE.get(key);
  if (!v) {
    v = Array.from({ length: W * H }, (_, i) => neighborsOf(i, W, H));
    NB_CACHE.set(key, v);
  }
  return v;
}

export interface PolicyFx {
  edu: number; health: number; safety: number; culture: number; env: number; housing: number;
  mobility: number; employment: number; satisfaction: number; energyDemand: number; output: number;
  pollution: number; nature: number; bankStab: number; skilled: number; tollsPerTile: number; housingCap: number;
}

export function policyFx(s: GameState): PolicyFx {
  const a: PolicyFx = {
    edu: 0, health: 0, safety: 0, culture: 0, env: 0, housing: 0, mobility: 0, employment: 0,
    satisfaction: 0, energyDemand: 0, output: 0, pollution: 0, nature: 0, bankStab: 0, skilled: 0,
    tollsPerTile: 0, housingCap: 0,
  };
  for (const id of s.policies) {
    const p = P[id];
    if (!p) continue;
    for (const [k, v] of Object.entries(p.fx)) (a as any)[k] += v as number;
  }
  return a;
}

/** Tuiles du réseau routier relié à la mairie (1 = connectée). */
export function roadNetwork(s: GameState): Uint8Array {
  const NB = nbs(s.W, s.H);
  const connected = new Uint8Array(s.tiles.length);
  const queue: number[] = [s.capital];
  connected[s.capital] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    for (const nb of NB[queue[qi]]) {
      if (!connected[nb] && (s.tiles[nb].infra === 'road' || s.tiles[nb].infra === 'highway')) {
        connected[nb] = 1;
        queue.push(nb);
      }
    }
  }
  return connected;
}

export function computeMetrics(s: GameState): Metrics {
  const { W, H, tiles } = s;
  const n = tiles.length;
  const NB = nbs(W, H);
  const px = policyFx(s);
  const ci = s.macro.costIndex;
  const L = s.level;
  const radius = territoryRadius(L);

  // ---- Réseau routier connecté à la mairie
  const connected = new Uint8Array(n);
  const queue: number[] = [s.capital];
  connected[s.capital] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    for (const nb of NB[queue[qi]]) {
      if (!connected[nb] && (tiles[nb].infra === 'road' || tiles[nb].infra === 'highway')) {
        connected[nb] = 1;
        queue.push(nb);
      }
    }
  }
  const served = (i: number) => connected[i] === 1 || NB[i].some((j) => connected[j] === 1);

  // ---- Réseau ferré (union-find) : voies + gares
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const isStation = (i: number) => {
    const t = tiles[i];
    return !!t.building && t.build === 0 && !!B[t.building]?.station;
  };
  for (let i = 0; i < n; i++) {
    if (tiles[i].infra === 'rail' || isStation(i)) {
      for (const j of NB[i]) {
        if (tiles[j].infra === 'rail' || isStation(j)) {
          const a = find(i);
          const b = find(j);
          if (a !== b) parent[a] = b;
        }
      }
    }
  }
  const stationRoots = new Map<number, number>();
  let stations = 0;
  for (let i = 0; i < n; i++) {
    if (isStation(i)) {
      stations++;
      const r = find(i);
      stationRoots.set(r, (stationRoots.get(r) ?? 0) + 1);
    }
  }
  let connectedStations = 0;
  let lines = 0;
  for (const c of stationRoots.values()) {
    if (c >= 2) {
      connectedStations += c;
      lines++;
    }
  }

  // ---- Agrégats par bâtiment
  let housingCap = 0, j0 = 0, j1 = 0;
  let eduP = 0, eduS = 0, eduH = 0, health = 0, safety = 0, cult = 0;
  let busTransit = 0, gareTransit = 0, otherTransit = 0;
  let supply = 0, pollutionRaw = 0, green = 0, absorb = 0, credit = 0, econBonus = 0, banks = 0, airports = 0;
  let thrillWeighted = 0;
  const rideTypes = new Set<string>();
  let servedCount = 0, totalBuildings = 0;
  let roadTiles = 0, highwayTiles = 0, railTiles = 0, natureTiles = 0, forestTiles = 0;
  const upkeepRaw: Record<string, number> = {};
  const counts: Record<string, number> = {};
  const econ: { def: BuildingDef; sv: number; hw: boolean }[] = [];
  const dist = Array.from({ length: 7 }, () => ({ housing: 0, polluters: 0, greens: 0, services: 0, highways: 0 }));

  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    const inT = inTerritory(s, i);
    if (t.infra === 'road') roadTiles++;
    else if (t.infra === 'highway') {
      highwayTiles++;
      dist[t.district].highways++;
    } else if (t.infra === 'rail') railTiles++;
    if (inT && t.zone === 'nature') natureTiles++;
    if (inT && t.terrain === 'forest' && !t.building) forestTiles++;
    if (!t.building || t.build > 0) continue;
    const def = B[t.building];
    if (!def) continue;
    counts[def.id] = (counts[def.id] ?? 0) + 1;
    const sv = served(i) ? 1 : 0.5;
    if (def.id !== 'mairie') {
      totalBuildings++;
      if (sv === 1) servedCount++;
    }
    upkeepRaw[def.cat] = (upkeepRaw[def.cat] ?? 0) + def.upkeep;
    if (def.housing || def.rideCapacity) {
      const cap = (def.housing ?? 0) + (def.rideCapacity ?? 0);
      housingCap += cap * sv;
      dist[t.district].housing += cap * sv;
      if (def.rideCapacity) {
        thrillWeighted += (def.thrill ?? 0) * def.rideCapacity * sv;
        rideTypes.add(def.id);
      }
    }
    if (def.jobs) {
      if (def.skilled) j1 += def.jobs * sv;
      else j0 += def.jobs * sv;
      if (def.prod) econ.push({ def, sv, hw: NB[i].some((j) => tiles[j].infra === 'highway') });
    }
    if (def.eduP) eduP += def.eduP * sv;
    if (def.eduS) eduS += def.eduS * sv;
    if (def.eduH) eduH += def.eduH * sv;
    if (def.health) health += def.health * sv;
    if (def.safety) safety += def.safety * sv;
    if (def.culture) cult += def.culture * sv;
    if (def.transit) {
      const v = def.transit * sv;
      if (def.id === 'depot') busTransit += v;
      else if (def.id === 'gare') gareTransit += v;
      else otherTransit += v;
    }
    if (def.supply) supply += def.supply;
    if (def.pollution) pollutionRaw += def.pollution;
    if (def.green) green += def.green;
    if (def.absorb) absorb += def.absorb;
    if (def.credit) credit += def.credit;
    if (def.econBonus) econBonus += def.econBonus;
    if (def.cat === 'finance') banks++;
    if (def.id === 'aeroport') airports++;
    // Données par district
    const d = dist[t.district];
    if ((def.pollution ?? 0) >= 0.8) d.polluters++;
    if (def.green || def.culture) d.greens++;
    if (def.eduP || def.eduS || def.eduH || def.health || def.safety) d.services++;
  }

  const pop = Math.max(1, s.pop);
  housingCap *= 1 + px.housingCap;
  const effOf = (key: string) => eff(s.funding[key] ?? 1);

  // ---- Éducation (mode Parc : variété des attractions, basée sur les sensations et la diversité des manèges)
  let eduIdx: number;
  if (s.park) {
    const avgThrill = housingCap > 0 ? thrillWeighted / housingCap : 0;
    eduIdx = clamp(avgThrill * 60 + rideTypes.size * 8, 0, 100);
  } else {
    const w = L === 0 ? [0.55, 0.45, 0] : [0.4, 0.35, 0.25];
    const covP = Math.min(1, eduP / (pop * 0.12));
    const covS = Math.min(1, eduS / (pop * 0.1));
    const covH = Math.min(1, eduH / (pop * 0.05));
    eduIdx = clamp(100 * (w[0] * covP + w[1] * covS + w[2] * covH) * effOf('education') + px.edu, 0, 100);
  }

  // ---- Emploi
  const workforce = pop * 0.55;
  const skilledShare = clamp(0.08 + 0.5 * (eduIdx / 100) + px.skilled, 0, 0.65);
  const skilledWorkers = workforce * skilledShare;
  const filled1 = Math.min(j1, skilledWorkers);
  const filled0 = Math.min(j0, workforce - filled1);
  const fill1 = j1 > 0 ? filled1 / j1 : 1;
  const fill0 = j0 > 0 ? filled0 / j0 : 1;
  const filled = filled0 + filled1;
  const unemployment = clamp(1 - filled / workforce, 0, 1);
  const employmentIdx = clamp(100 * (1 - 2.5 * unemployment) + px.employment, 0, 100);

  // ---- Énergie
  const energyDemand = s.park
    ? (housingCap * 0.08 + filled * 0.8) * (1 + px.energyDemand)
    : (pop * 0.4 + filled * 0.8) * (1 + px.energyDemand);
  const energyRatio = energyDemand > 0 ? supply / energyDemand : 1;
  const energyIdx = clamp(100 * Math.min(1, energyRatio), 0, 100);
  const energyFactor = energyRatio >= 1 ? 1 : 0.4 + 0.6 * energyRatio;

  // ---- Production
  const cycleMult = 1 + 0.08 * s.macro.cycle;
  const taxDrag = Math.max(0.7, 1 - Math.max(0, s.rates.corp - 12) * 0.012);
  const mult = energyFactor * cycleMult * taxDrag * (1 + px.output) * (1 + econBonus) * ci;
  let output = 0;
  for (const e of econ) {
    const fill = e.def.skilled ? fill1 : fill0;
    output += e.def.jobs! * fill * e.def.prod! * e.sv * (e.hw ? 1.08 : 1) * mult;
  }
  const wage = (5 + 2.5 * (eduIdx / 100)) * ci;
  const incomeBase = filled * wage;

  // ---- Environnement
  const pollution = pollutionRaw * (1 + px.pollution) + highwayTiles * 0.3 + roadTiles * 0.02;
  const absorbTotal = (green + absorb + forestTiles * 0.05 + natureTiles * 0.1 * (1 + px.nature)) * effOf('environment');
  const net = pollution - absorbTotal * 0.8;
  const envIdx = clamp(100 - (100 * Math.max(0, net)) / (1 + (pop / 1000) * 0.9) + px.env, 0, 100);

  // ---- Services
  const healthIdx = clamp(100 * Math.min(1, health / pop) * effOf('health') + px.health, 0, 100);
  const safetyIdx = clamp(100 * Math.min(1, safety / pop) * effOf('safety') * (1 - 0.5 * unemployment) + px.safety, 0, 100);
  const cultureNeed = pop / 100;
  const cultureIdx = clamp(100 * Math.min(1, cult / cultureNeed) * effOf('culture') + px.culture, 0, 100);

  const pressure = housingCap > 0 ? pop / housingCap : 1.2;
  const housingIdx = clamp(130 - 80 * pressure + px.housing, 0, 100);

  // ---- Flotte de véhicules : bus/tram et trains doivent être achetés pour faire fonctionner dépôts et gares
  const depotCount = counts.depot ?? 0;
  const busesNeeded = depotCount * BUSES_PER_DEPOT;
  const busFactor = depotCount > 0 ? clamp(s.fleet.buses / busesNeeded, 0, 1) : 0;
  const trainsNeeded = lines * TRAINS_PER_LINE;
  const trainFactor = lines > 0 ? clamp(s.fleet.trains / trainsNeeded, 0, 1) : 0;
  const transit = busTransit * busFactor + gareTransit * trainFactor + otherTransit;

  // ---- Mobilité
  const servedShare = totalBuildings > 0 ? servedCount / totalBuildings : 1;
  const roadCap = 600 * roadTiles + 2500 * highwayTiles;
  const transitCap = transit * effOf('transport') + connectedStations * trainFactor * 2200;
  const mobilityIdx = clamp(
    100 * (0.4 * servedShare + 0.3 * Math.min(1, transitCap / (pop * 0.35)) + 0.3 * Math.min(1, roadCap / pop)) + px.mobility,
    0, 100,
  );

  const idx = {
    edu: eduIdx, health: healthIdx, safety: safetyIdx, culture: cultureIdx, env: envIdx,
    housing: housingIdx, employment: employmentIdx, energy: energyIdx, mobility: mobilityIdx,
  };
  const wellbeing =
    0.13 * eduIdx + 0.14 * healthIdx + 0.1 * safetyIdx + 0.15 * employmentIdx + 0.12 * housingIdx +
    0.12 * envIdx + 0.06 * energyIdx + 0.09 * mobilityIdx + 0.09 * cultureIdx;

  const attract = clamp(0.35 + 0.65 * (wellbeing / 100), 0.3, 1) * (unemployment > 0.25 ? 0.85 : 1);

  // ---- Finances
  const revenue = s.park ? {
    income: 0,
    corp: output,
    property: 0,
    tickets: (s.rates.entry / 1000) * pop * ci,
    planeTickets: 0,
    tolls: 0,
    transfers: 0,
    vat: 0,
    total: 0,
  } : {
    income: (s.rates.income / 100) * incomeBase,
    corp: (s.rates.corp / 100) * output,
    property: (s.rates.property / 100) * pop * 1.1 * ci,
    tickets: connectedStations * trainFactor * s.rates.transit * Math.min(1, pop / 3000) * ci,
    planeTickets: airports * s.rates.plane * Math.min(1, pop / 8000) * ci,
    tolls: px.tollsPerTile * s.rates.toll * highwayTiles,
    transfers: L === 0 ? 0.06 * pop * ci : L === 1 ? 0.04 * pop * ci : 0,
    vat: L === 2 ? 0.07 * incomeBase : 0,
    total: 0,
  };
  revenue.total = revenue.income + revenue.corp + revenue.property + revenue.tickets + revenue.planeTickets + revenue.tolls + revenue.transfers + revenue.vat;

  if (!s.park) upkeepRaw.transport = (upkeepRaw.transport ?? 0) + s.fleet.buses * BUS_UPKEEP + s.fleet.trains * TRAIN_UPKEEP;

  const upkeep: Record<string, number> = {};
  let upkeepTotal = 0;
  for (const [cat, raw] of Object.entries(upkeepRaw)) {
    const fk = FUNDING_KEY[cat as keyof typeof FUNDING_KEY];
    const v = raw * (fk ? s.funding[fk] ?? 1 : 1) * ci;
    upkeep[cat] = v;
    upkeepTotal += v;
  }
  const admin = s.park ? (12 + 0.008 * pop) * ci : (18 + 0.045 * pop) * (1 + 0.5 * L) * ci;
  let policies = 0;
  for (const id of s.policies) policies += (P[id]?.upkeep ?? 0) * ci;
  let interest = 0;
  let principal = 0;
  let debt = 0;
  for (const ln of s.loans) {
    interest += (ln.balance * ln.rate) / 400;
    principal += ln.termLeft <= 1 ? ln.balance : Math.min(ln.balance, ln.amount0 / ln.term);
    debt += ln.balance;
  }
  const operating = upkeepTotal + admin + policies + interest;
  const annualRev = revenue.total * 4;
  const creditLimit = banks > 0 ? 400 + credit + annualRev * 0.3 : 0;
  const spread = 1 + clamp(debt / Math.max(1, annualRev), 0, 3) * 1.5 + ((100 - s.bankStability) / 100) * 1.5;
  const baseRate = L === 2 ? s.policyRate : s.macro.baseRate;
  const loanRate = Math.round((baseRate + spread) * 100) / 100;

  // ---- Districts
  const totalH = dist.reduce((a, d) => a + d.housing, 0);
  const districts: DistrictInfo[] = dist.map((d, k) => {
    const share = totalH > 0 ? d.housing / totalH : 1 / 7;
    const delta = clamp(3 * d.greens + 2 * d.services - 4 * d.polluters - 1.5 * d.highways, -15, 12);
    return { name: DISTRICT_NAMES[k], pop: pop * share, share, delta, polluters: d.polluters, greens: d.greens, services: d.services };
  });

  const taxPenalty = s.park
    ? Math.max(0, s.rates.entry - 25) * 1.2
    : Math.max(0, s.rates.income - 14) * 0.5 + Math.max(0, s.rates.property - 14) * 0.5 + Math.max(0, s.rates.corp - 14) * 0.2;

  void radius;
  return {
    pop, housingCap, workforce, jobs: j0 + j1, filled, unemployment, incomeBase, output, revenue, upkeep,
    expenses: { upkeep: upkeepTotal, admin, policies, interest, operating, principal },
    operatingBalance: revenue.total - operating,
    netCash: revenue.total - operating - principal,
    idx, wellbeing, energySupply: supply, energyDemand, pollution: net,
    creditLimit, creditAvailable: Math.max(0, creditLimit - debt), debt, loanRate, banks,
    stations, connectedStations, lines, roadTiles, highwayTiles, railTiles, servedShare, districts, counts,
    attract, taxPenalty, busFactor, trainFactor, busesNeeded, trainsNeeded,
  };
}

// --------------------------------------------------------------------------------------------

function rollEvents(s: GameState, m: Metrics) {
  const ci = s.macro.costIndex;
  const scale = 1 + s.level;
  if (rand(s) < 0.07) {
    const amount = Math.round((100 + rand(s) * 300) * scale * ci);
    s.treasury += amount;
    pushLog(s, 'good', `Une subvention de développement durable de ${amount} k€ est accordée.`);
  }
  if (rand(s) < 0.05) {
    const mitig = 0.6 * ((m.counts.pompiers ?? 0) > 0 ? 1 : 0) + 0.3 * (m.idx.safety / 100);
    const dmg = Math.round(150 * scale * ci * (1 - clamp(mitig, 0, 0.85)));
    s.treasury -= dmg;
    pushLog(s, 'bad', `Inondations : ${dmg} k€ de réparations${(m.counts.pompiers ?? 0) > 0 ? ' (réduits grâce aux pompiers)' : ''}.`);
  }
  if (rand(s) < 0.06) {
    const hit = ((100 - m.idx.env) / 100) * 5 * (1 - (m.idx.health / 100) * 0.5);
    s.satisfaction = clamp(s.satisfaction - hit, 0, 100);
    pushLog(s, 'bad', `Canicule : la population en souffre${m.idx.env < 50 ? ' — plus de verdure aiderait' : ''}.`);
  }
  if (rand(s) < 0.03) {
    const hit = (1 - m.idx.health / 100) * 8;
    s.satisfaction = clamp(s.satisfaction - hit, 0, 100);
    pushLog(s, hit > 3 ? 'bad' : 'info', `Épidémie saisonnière : ${m.idx.health > 70 ? 'bien absorbée par le système de santé' : 'le système de santé est sous tension'}.`);
  }
  if (m.energyDemand > 0 && m.energySupply / m.energyDemand < 0.9 && rand(s) < 0.35) {
    s.satisfaction = clamp(s.satisfaction - 2, 0, 100);
    pushLog(s, 'bad', 'Coupures d’électricité : la production d’énergie est insuffisante.');
  }
  if (s.bankStability < 40 && rand(s) < (40 - s.bankStability) / 60) {
    const cost = Math.round(300 * scale * ci);
    s.treasury -= cost;
    s.bankStability = clamp(s.bankStability + 15, 0, 100);
    pushLog(s, 'bad', `Crise bancaire locale : ${cost} k€ pour sauver les dépôts des habitants.`);
  }
  if (m.idx.culture > 55 && rand(s) < 0.07) {
    s.satisfaction = clamp(s.satisfaction + 4, 0, 100);
    pushLog(s, 'good', 'Un festival fait rayonner la commune : la population est ravie.');
  }
  if (m.idx.edu > 60 && rand(s) < 0.04) {
    const amount = Math.round(80 * scale * ci);
    s.treasury += amount;
    pushLog(s, 'good', s.park
      ? `Le bouche-à-oreille sur la variété des attractions attire des visiteurs supplémentaires : +${amount} k€ de recettes.`
      : `Une jeune entreprise issue de vos écoles s’installe : +${amount} k€ de recettes.`);
  }
}

function generateProposals(s: GameState) {
  const ci = s.macro.costIndex;
  const pool = ['parc', 'biblio', 'ecole', 'clinique', 'stade', 'bio', 'depot', 'epuration', 'pavillons'];
  s.proposals = [];
  for (let k = 0; k < 3; k++) {
    const id = pool[Math.floor(rand(s) * pool.length)];
    const district = Math.floor(rand(s) * 7);
    const def = B[id];
    s.proposals.push({
      id: s.nextId++, district, building: id, cost: Math.round(def.cost * ci),
      title: `${def.icon} ${def.name} — ${district === 0 ? 'Centre' : 'Secteur ' + DISTRICT_NAMES[district]}`,
    });
  }
}

export function endTurn(s: GameState): void {
  const m = computeMetrics(s);

  // 1. Chantiers
  for (const t of s.tiles) {
    if (t.building && t.build > 0) {
      t.build--;
      if (t.build === 0) pushLog(s, 'good', `Chantier terminé : ${B[t.building].name}.`);
    }
  }

  // 2. Trésorerie et dettes
  s.treasury += m.revenue.total - m.expenses.operating;
  let principalPaid = 0;
  for (const ln of s.loans) {
    const pay = ln.termLeft <= 1 ? ln.balance : Math.min(ln.balance, ln.amount0 / ln.term);
    ln.balance -= pay;
    ln.termLeft--;
    principalPaid += pay;
  }
  s.treasury -= principalPaid;
  s.loans = s.loans.filter((l) => l.balance > 0.5 && l.termLeft > 0);

  // 3. Population
  const target = m.housingCap * m.attract;
  const delta = (target - s.pop) * 0.3;
  const step = Math.abs(delta) < 1 ? Math.sign(delta) : delta;
  s.pop = Math.max(50, Math.round(s.pop + step));

  // 4. Satisfaction
  const px = policyFx(s);
  const overdraft = s.treasury < 0 ? 3 : 0;
  const target2 = clamp(0.85 * m.wellbeing + 8 + px.satisfaction - m.taxPenalty - overdraft, 0, 100);
  s.satisfaction = clamp(0.65 * s.satisfaction + 0.35 * target2, 0, 100);
  if (s.treasury < -300) pushLog(s, 'bad', 'Les finances sont en déficit profond : la commune est placée sous surveillance.');

  // 5. Macroéconomie et banques
  const mc = s.macro;
  const rateEffect = s.level === 2 ? (3 - s.policyRate) : 0;
  mc.cycle = clamp(0.85 * mc.cycle + gauss(s) * 0.12 + rateEffect * 0.03, -1, 1);
  mc.inflation = clamp(0.9 * mc.inflation + 0.1 * (1.5 + mc.cycle * 1.5 + rateEffect * 0.25), -1, 12);
  mc.costIndex *= 1 + mc.inflation / 400;
  mc.baseRate = clamp(2.5 + 0.5 * (mc.inflation - 1.5) + mc.cycle * 0.5, 0.5, 8);
  const annualRev = Math.max(1, m.revenue.total * 4);
  const rateCtl = (m.counts.banque_centrale ?? 0) > 0 ? 10 : 0;
  const targetStab =
    60 + Math.min(15, m.banks * 4) + rateCtl + px.bankStab - clamp(m.debt / annualRev, 0, 3) * 12 -
    (s.level === 2 ? Math.abs(s.policyRate - 3) * 2 : 0);
  s.bankStability = clamp(s.bankStability + (targetStab - s.bankStability) * 0.15, 0, 100);

  // 6. Événements
  rollEvents(s, m);

  // 7. Budget participatif
  if (s.policies.includes('budget_participatif') && s.proposals.length === 0 && s.turn >= s.nextProposalTurn) {
    generateProposals(s);
    s.nextProposalTurn = s.turn + 4;
    pushLog(s, 'info', 'Le budget participatif a reçu de nouvelles propositions des habitants.');
  }

  // 7b. Cagnottes citoyennes
  if (s.fundraisers.length) {
    const pool = s.pop * 0.08 * (s.satisfaction / 100) * s.macro.costIndex;
    const share = pool / s.fundraisers.length;
    for (const fr of [...s.fundraisers]) {
      fr.raised += share;
      if (fr.raised < fr.goal) continue;
      const def = B[fr.building];
      let best = -1;
      let bestScore = -1;
      for (let i = 0; i < s.tiles.length; i++) {
        const t = s.tiles[i];
        if (t.district !== fr.district || !inTerritory(s, i)) continue;
        if (t.building || t.infra !== 'none' || !def.terrains.includes(t.terrain)) continue;
        const near = neighborsOf(i, s.W, s.H).some((j) => s.tiles[j].infra === 'road' || s.tiles[j].infra === 'highway' || s.tiles[j].building);
        const sc = near ? 2 : 1;
        if (sc > bestScore) {
          best = i;
          bestScore = sc;
        }
      }
      s.fundraisers = s.fundraisers.filter((x) => x.id !== fr.id);
      if (best < 0) {
        pushLog(s, 'bad', `Cagnotte citoyenne aboutie pour ${def.name}, mais plus aucun emplacement libre dans le secteur ${DISTRICT_NAMES[fr.district]} : les dons sont reversés aux habitants.`);
        s.satisfaction = clamp(s.satisfaction + 1, 0, 100);
        continue;
      }
      const t = s.tiles[best];
      t.building = fr.building;
      t.build = def.turns;
      if (t.terrain === 'forest' && fr.building !== 'parc') t.terrain = 'plain';
      s.satisfaction = clamp(s.satisfaction + 3, 0, 100);
      pushLog(s, 'good', `Cagnotte citoyenne aboutie : les habitants du secteur ${DISTRICT_NAMES[fr.district]} financent ${def.icon} ${def.name} !`);
    }
  }

  // 8. Avancement
  s.turn++;
  for (const k of Object.keys(s.unlocks)) if (s.unlocks[k] <= s.turn) delete s.unlocks[k];

  const m2 = computeMetrics(s);
  s.wellbeing = m2.wellbeing;
  if (!s.park && s.level < 2 && s.pop >= LEVEL_POP_GOAL[s.level] && s.wellbeing >= LEVEL_WB_GOAL[s.level]) s.levelStreak++;
  else s.levelStreak = 0;
  const wasReady = s.levelReady;
  s.levelReady = s.level < 2 && s.levelStreak >= 2;
  if (s.levelReady && !wasReady) {
    pushLog(s, 'good', s.level === 0
      ? 'Votre commune est prête à s’élargir en région ! (onglet Ville)'
      : 'Votre région est prête à former un pays ! (onglet Ville)');
  }

  // 9. Élections
  if (!s.sandbox && s.turn >= s.nextElection) runElection(s, m2);

  const m3 = s.turn >= 0 ? computeMetrics(s) : m2;
  s.history.push({
    turn: s.turn, pop: s.pop, wellbeing: m3.wellbeing, satisfaction: s.satisfaction, treasury: s.treasury, debt: m3.debt,
  });
  if (s.history.length > 400) s.history.shift();
}
