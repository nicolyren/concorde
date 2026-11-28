import { generateMap } from './mapgen';
import { hexDist } from './hex';
import { makeRng } from './rng';
import type { Terrain } from './types';

export type LifeBuilding = 'maison' | 'supermarche' | 'travail';

export interface LifeTile {
  terrain: Terrain;
  building: LifeBuilding | null;
}

export interface LifeState {
  seed: number;
  W: number;
  H: number;
  tiles: LifeTile[];
  home: number;
  shop: number;
  job: number;
  day: number;
  budget: number;
  /** 0 = repu, 100 = affamé. */
  hunger: number;
  log: string[];
}

export interface LifeResult {
  ok: boolean;
  msg: string;
}
const ok = (msg = ''): LifeResult => ({ ok: true, msg });
const ko = (msg: string): LifeResult => ({ ok: false, msg });

export const LIFE_W = 23;
export const LIFE_H = 17;
export const FOOD_COST = 12;
export const WORK_PAY = 45;
export const HUNGER_PER_WORK = 30;
export const START_BUDGET = 60;

/** Un petit pays déjà parfaitement en place : on ne le construit pas, on y vit. */
export function newLife(seed: number = Date.now() >>> 0): LifeState {
  const { tiles: genTiles, capital } = generateMap(seed, LIFE_W, LIFE_H);
  const tiles: LifeTile[] = genTiles.map((t) => ({ terrain: t.terrain, building: null }));
  const rng = makeRng((seed ^ 0x51ed9a3) >>> 0);
  const cand: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].terrain === 'plain' && hexDist(i, capital, LIFE_W) >= 2 && hexDist(i, capital, LIFE_W) <= 6) cand.push(i);
  }
  for (let k = cand.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [cand[k], cand[j]] = [cand[j], cand[k]];
  }
  let shop = -1, job = -1;
  for (const i of cand) {
    if (shop < 0) { shop = i; continue; }
    if (job < 0 && hexDist(i, shop, LIFE_W) >= 3) { job = i; break; }
  }
  if (shop < 0) shop = capital;
  if (job < 0) job = capital;
  tiles[capital].building = 'maison';
  tiles[shop].building = 'supermarche';
  tiles[job].building = 'travail';
  return {
    seed, W: LIFE_W, H: LIFE_H, tiles, home: capital, shop, job,
    day: 1, budget: START_BUDGET, hunger: 20,
    log: ['Bienvenue dans votre nouvelle vie !'],
  };
}

function pushLog(s: LifeState, text: string) {
  s.log.push(text);
  if (s.log.length > 100) s.log.splice(0, s.log.length - 100);
}

export function buyFood(s: LifeState): LifeResult {
  if (s.budget < FOOD_COST) return ko('Fonds insuffisants pour faire les courses.');
  s.budget -= FOOD_COST;
  s.hunger = 0;
  pushLog(s, `Jour ${s.day} : courses au supermarché (-${FOOD_COST}€).`);
  return ok(`🛒 Courses faites : -${FOOD_COST}€.`);
}

export function goToWork(s: LifeState): LifeResult {
  const malus = s.hunger >= 100;
  const pay = malus ? Math.round(WORK_PAY * 0.5) : WORK_PAY;
  s.budget += pay;
  s.hunger = Math.min(100, s.hunger + HUNGER_PER_WORK);
  s.day++;
  pushLog(s, malus ? `Jour ${s.day - 1} : journée difficile, trop faim (+${pay}€).` : `Jour ${s.day - 1} : journée de travail (+${pay}€).`);
  return ok(malus ? `💼 Journée difficile (trop faim) : +${pay}€ seulement.` : `💼 Journée de travail : +${pay}€.`);
}

export function serializeLife(s: LifeState): string {
  return JSON.stringify(s);
}

export function deserializeLife(raw: string): LifeState | null {
  try {
    const s = JSON.parse(raw) as LifeState;
    if (!s || !Array.isArray(s.tiles) || typeof s.home !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}
