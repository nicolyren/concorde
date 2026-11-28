import { generateMap } from './mapgen';
import { hexDist, neighborsOf } from './hex';
import { makeRng } from './rng';
import type { Terrain } from './types';

export type LifeBuilding = 'maison' | 'supermarche' | 'travail' | 'aeroport' | 'plage';

export interface LifeTile {
  terrain: Terrain;
  building: LifeBuilding | null;
  /** Route/trottoir : réservé aux voitures en mode conduite, libre pour les piétons. */
  road: boolean;
  /** Décor purement visuel (fleurs, fontaine, banc…), sans effet de jeu. */
  decor: string | null;
}

/** Une carte explorable : le pays natal, ou la destination de vacances accessible par avion. */
export interface LifeMapData {
  kind: 'home' | 'vacation';
  W: number;
  H: number;
  tiles: LifeTile[];
  home: number;
  /** -1 si inexistant sur cette carte (ex. pas de commerce en vacances). */
  shop: number;
  job: number;
  airport: number;
  plage: number;
}

export interface LifeState extends LifeMapData {
  seed: number;
  name: string;
  /** La carte où l'on ne se trouve pas actuellement (null si jamais visitée). */
  away: LifeMapData | null;
  day: number;
  budget: number;
  /** 0 = repu, 100 = affamé. */
  hunger: number;
  /** 0 = repos, 100 = épuisé. */
  fatigue: number;
  hasCar: boolean;
  driving: boolean;
  log: string[];
}

export interface LifeResult {
  ok: boolean;
  msg: string;
}
const ok = (msg = ''): LifeResult => ({ ok: true, msg });
const ko = (msg: string): LifeResult => ({ ok: false, msg });

export interface FoodItem {
  id: string;
  name: string;
  icon: string;
  cost: number;
  /** Faim retirée par unité achetée. */
  fill: number;
}

export const FOOD_ITEMS: FoodItem[] = [
  { id: 'pain', name: 'Pain', icon: '🍞', cost: 3, fill: 15 },
  { id: 'lait', name: 'Lait', icon: '🥛', cost: 2, fill: 10 },
  { id: 'salade', name: 'Salade', icon: '🥗', cost: 4, fill: 15 },
  { id: 'poulet', name: 'Poulet', icon: '🍗', cost: 8, fill: 35 },
  { id: 'pizza', name: 'Pizza', icon: '🍕', cost: 10, fill: 40 },
  { id: 'gateau', name: 'Gâteau', icon: '🍰', cost: 5, fill: 20 },
];

export const LIFE_W = 23;
export const LIFE_H = 17;
export const WORK_PAY = 45;
export const HUNGER_PER_WORK = 30;
export const FATIGUE_PER_WORK = 25;
export const CAR_COST = 300;
export const CAR_SPEED_MULT = 2.2;
export const START_BUDGET = 80;
export const FLIGHT_COST = 30;
const VACATION_W = 15;
const VACATION_H = 11;
const DECOR = ['🌷', '🌼', '🪻', '⛲', '🪑'];
const NAME_PREFIX = ['Belle', 'Claire', 'Joli', 'Douce', 'Riante', 'Sereine', 'Verte', 'Haute', 'Bonne', 'Chère'];
const NAME_ROOT = ['fontaine', 'val', 'mont', 'rive', 'bourg', 'champs', 'bois', 'lac', 'plaine', 'colline'];

function pickName(rng: () => number): string {
  const p = NAME_PREFIX[Math.floor(rng() * NAME_PREFIX.length)];
  const r = NAME_ROOT[Math.floor(rng() * NAME_ROOT.length)];
  return p + r;
}

/** Plus court chemin (en tuiles franchissables) entre deux cases, pour tracer les routes. */
function roadPath(tiles: LifeTile[], W: number, H: number, from: number, to: number): number[] {
  if (from === to) return [from];
  const prev = new Int32Array(tiles.length).fill(-1);
  const seen = new Uint8Array(tiles.length);
  seen[from] = 1;
  const queue = [from];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === to) break;
    for (const nb of neighborsOf(cur, W, H)) {
      if (seen[nb] || tiles[nb].terrain === 'water' || tiles[nb].terrain === 'mountain') continue;
      seen[nb] = 1;
      prev[nb] = cur;
      queue.push(nb);
    }
  }
  if (!seen[to]) return [];
  const path: number[] = [];
  for (let cur = to; cur !== -1; cur = prev[cur]) {
    path.push(cur);
    if (cur === from) break;
  }
  return path.reverse();
}

/**
 * Ajoute de petites rues secondaires qui partent des routes principales, pour un vrai
 * réseau de rues dans lequel se promener plutôt que de simples chemins entre bâtiments.
 */
function extendStreets(tiles: LifeTile[], W: number, H: number, rng: () => number) {
  const base: number[] = [];
  for (let i = 0; i < tiles.length; i++) if (tiles[i].road) base.push(i);
  for (const start of base) {
    if (rng() >= 0.45) continue;
    let cur = start;
    const len = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < len; k++) {
      const nb = neighborsOf(cur, W, H).filter((j) => !tiles[j].road && !tiles[j].building && tiles[j].terrain !== 'water' && tiles[j].terrain !== 'mountain');
      if (!nb.length) break;
      cur = nb[Math.floor(rng() * nb.length)];
      tiles[cur].road = true;
    }
  }
}

/** Un petit pays déjà parfaitement en place : on ne le construit pas, on y vit. */
export function newLife(seed: number = Date.now() >>> 0): LifeState {
  const { tiles: genTiles, capital } = generateMap(seed, LIFE_W, LIFE_H);
  const tiles: LifeTile[] = genTiles.map((t) => ({ terrain: t.terrain, building: null, road: false, decor: null }));
  const rng = makeRng((seed ^ 0x51ed9a3) >>> 0);
  const name = pickName(rng);
  const cand: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].terrain === 'plain' && hexDist(i, capital, LIFE_W) >= 2 && hexDist(i, capital, LIFE_W) <= 6) cand.push(i);
  }
  for (let k = cand.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [cand[k], cand[j]] = [cand[j], cand[k]];
  }
  let shop = -1, job = -1, airport = -1;
  for (const i of cand) {
    if (shop < 0) { shop = i; continue; }
    if (job < 0 && hexDist(i, shop, LIFE_W) >= 3) { job = i; continue; }
    if (airport < 0 && hexDist(i, shop, LIFE_W) >= 3 && hexDist(i, job, LIFE_W) >= 3) { airport = i; break; }
  }
  if (shop < 0) shop = capital;
  if (job < 0) job = capital;
  if (airport < 0) airport = capital;
  tiles[capital].building = 'maison';
  tiles[shop].building = 'supermarche';
  tiles[job].building = 'travail';
  tiles[airport].building = 'aeroport';
  for (const i of roadPath(tiles, LIFE_W, LIFE_H, capital, shop)) tiles[i].road = true;
  for (const i of roadPath(tiles, LIFE_W, LIFE_H, capital, job)) tiles[i].road = true;
  for (const i of roadPath(tiles, LIFE_W, LIFE_H, shop, job)) tiles[i].road = true;
  for (const i of roadPath(tiles, LIFE_W, LIFE_H, capital, airport)) tiles[i].road = true;
  extendStreets(tiles, LIFE_W, LIFE_H, rng);
  // Petites touches décoratives (fleurs, fontaine, bancs) autour de la maison : un pays
  // qu'on a envie d'habiter, sans impact sur le jeu.
  let decorLeft = 6;
  for (let i = 0; i < tiles.length && decorLeft > 0; i++) {
    const t = tiles[i];
    if (t.building || t.road || t.terrain !== 'plain') continue;
    if (hexDist(i, capital, LIFE_W) > 3) continue;
    if (rng() < 0.3) {
      t.decor = DECOR[Math.floor(rng() * DECOR.length)];
      decorLeft--;
    }
  }
  return {
    seed, name, kind: 'home', W: LIFE_W, H: LIFE_H, tiles, home: capital, shop, job, airport, plage: -1, away: null,
    day: 1, budget: START_BUDGET, hunger: 10, fatigue: 5, hasCar: false, driving: false,
    log: [`Bienvenue à ${name}, votre nouveau pays !`],
  };
}

/** Une destination de vacances, accessible en avion : juste un aéroport et une plage pour se détendre. */
function genVacationMap(seed: number): LifeMapData {
  const { tiles: genTiles, capital } = generateMap(seed, VACATION_W, VACATION_H);
  const tiles: LifeTile[] = genTiles.map((t) => ({ terrain: t.terrain, building: null, road: false, decor: null }));
  const rng = makeRng((seed ^ 0xb7ac4) >>> 0);
  const cand: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].terrain === 'plain' && hexDist(i, capital, VACATION_W) >= 2 && hexDist(i, capital, VACATION_W) <= 5) cand.push(i);
  }
  for (let k = cand.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [cand[k], cand[j]] = [cand[j], cand[k]];
  }
  const plage = cand.length ? cand[0] : capital;
  tiles[capital].building = 'aeroport';
  tiles[plage].building = 'plage';
  for (const i of roadPath(tiles, VACATION_W, VACATION_H, capital, plage)) tiles[i].road = true;
  extendStreets(tiles, VACATION_W, VACATION_H, rng);
  let decorLeft = 8;
  for (let i = 0; i < tiles.length && decorLeft > 0; i++) {
    const t = tiles[i];
    if (t.building || t.road || t.terrain !== 'plain') continue;
    if (hexDist(i, plage, VACATION_W) > 3 && hexDist(i, capital, VACATION_W) > 3) continue;
    if (rng() < 0.35) {
      t.decor = DECOR[Math.floor(rng() * DECOR.length)];
      decorLeft--;
    }
  }
  return { kind: 'vacation', W: VACATION_W, H: VACATION_H, tiles, home: capital, shop: -1, job: -1, airport: capital, plage };
}

function snapshotMap(s: LifeState): LifeMapData {
  return { kind: s.kind, W: s.W, H: s.H, tiles: s.tiles, home: s.home, shop: s.shop, job: s.job, airport: s.airport, plage: s.plage };
}

/** Prend l'avion à l'aéroport : part en vacances, ou rentre si on y est déjà. */
export function travel(s: LifeState): LifeResult {
  if (s.kind === 'home') {
    if (s.budget < FLIGHT_COST) return ko(`Fonds insuffisants pour le billet d’avion (${FLIGHT_COST}€).`);
    s.budget -= FLIGHT_COST;
    const dest = s.away && s.away.kind === 'vacation' ? s.away : genVacationMap(s.seed);
    const home = snapshotMap(s);
    Object.assign(s, dest);
    s.away = home;
    s.fatigue = Math.min(100, s.fatigue + 10);
    pushLog(s, `Jour ${s.day} : départ en vacances (-${FLIGHT_COST}€).`);
    return ok(`✈️ Vous voilà en vacances ! -${FLIGHT_COST}€.`);
  }
  const home = s.away;
  if (!home) return ko('Impossible de rentrer : destination introuvable.');
  const vacation = snapshotMap(s);
  Object.assign(s, home);
  s.away = vacation;
  pushLog(s, `Jour ${s.day} : retour de vacances.`);
  return ok('✈️ De retour chez vous.');
}

export function relaxAtBeach(s: LifeState): LifeResult {
  if (s.kind !== 'vacation') return ko('Pas de plage par ici.');
  s.fatigue = 0;
  pushLog(s, `Jour ${s.day} : après-midi à la plage.`);
  return ok('🏖️ Vous vous détendez à la plage.');
}

function pushLog(s: LifeState, text: string) {
  s.log.push(text);
  if (s.log.length > 100) s.log.splice(0, s.log.length - 100);
}

/** Achète un panier de produits (id → quantité) : le prix et l'effet sur la faim dépendent de ce qu'on prend. */
export function buyGroceries(s: LifeState, cart: Record<string, number>): LifeResult {
  let cost = 0, fill = 0, items = 0;
  for (const [id, qty] of Object.entries(cart)) {
    if (qty <= 0) continue;
    const item = FOOD_ITEMS.find((f) => f.id === id);
    if (!item) continue;
    cost += item.cost * qty;
    fill += item.fill * qty;
    items += qty;
  }
  if (items === 0) return ko('Panier vide.');
  if (s.budget < cost) return ko(`Fonds insuffisants pour ce panier (${cost}€ requis).`);
  s.budget -= cost;
  s.hunger = Math.max(0, s.hunger - fill);
  pushLog(s, `Jour ${s.day} : courses au supermarché (-${cost}€).`);
  return ok(`🛒 Courses faites : -${cost}€.`);
}

export function goToWork(s: LifeState): LifeResult {
  const malus = s.hunger >= 100 || s.fatigue >= 100;
  const pay = malus ? Math.round(WORK_PAY * 0.5) : WORK_PAY;
  s.budget += pay;
  s.hunger = Math.min(100, s.hunger + HUNGER_PER_WORK);
  s.fatigue = Math.min(100, s.fatigue + FATIGUE_PER_WORK);
  s.day++;
  pushLog(s, malus ? `Jour ${s.day - 1} : journée difficile, trop faim ou trop fatigué (+${pay}€).` : `Jour ${s.day - 1} : journée de travail (+${pay}€).`);
  return ok(malus ? `💼 Journée difficile (trop faim ou trop fatigué) : +${pay}€ seulement.` : `💼 Journée de travail : +${pay}€.`);
}

export function goHome(s: LifeState): LifeResult {
  s.fatigue = 0;
  pushLog(s, `Jour ${s.day} : retour à la maison pour se reposer.`);
  return ok('🏠 Vous rentrez chez vous et vous reposez.');
}

export function buyCar(s: LifeState): LifeResult {
  if (s.hasCar) return ko('Vous avez déjà une voiture.');
  if (s.budget < CAR_COST) return ko('Fonds insuffisants pour acheter une voiture.');
  s.budget -= CAR_COST;
  s.hasCar = true;
  pushLog(s, `Jour ${s.day} : achat d’une voiture (-${CAR_COST}€).`);
  return ok(`🚗 Voiture achetée : -${CAR_COST}€.`);
}

export function toggleDriving(s: LifeState): LifeResult {
  if (!s.hasCar) return ko('Vous n’avez pas encore de voiture.');
  s.driving = !s.driving;
  return ok(s.driving ? '🚗 Vous prenez le volant.' : '🚶 Vous descendez de voiture.');
}

export function serializeLife(s: LifeState): string {
  return JSON.stringify(s);
}

export function deserializeLife(raw: string): LifeState | null {
  try {
    const s = JSON.parse(raw) as LifeState;
    if (!s || !Array.isArray(s.tiles) || typeof s.home !== 'number') return null;
    if (s.fatigue === undefined) s.fatigue = 0;
    if (s.hasCar === undefined) s.hasCar = false;
    if (s.driving === undefined) s.driving = false;
    if (!s.name) s.name = 'Pays parfait';
    if (!s.kind) s.kind = 'home';
    if (s.airport === undefined) s.airport = -1;
    if (s.plage === undefined) s.plage = -1;
    if (s.away === undefined) s.away = null;
    for (const t of s.tiles) {
      if (t.road === undefined) t.road = false;
      if (t.decor === undefined) t.decor = null;
    }
    return s;
  } catch {
    return null;
  }
}
