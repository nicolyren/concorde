import { B, LEVEL_RADIUS, PARTIES, PLATFORMS, registerCustomBuilding } from './content';
import { hexDist, neighborsOf } from './hex';
import { generateMap } from './mapgen';
import { makeRng, rand } from './rng';
import type { GameState, Level } from './types';

export const MAP_W = 44;
export const MAP_H = 30;
export const START_YEAR = 2030;
export const SAVE_VERSION = 1;

export function territoryRadius(level: Level): number {
  return LEVEL_RADIUS[level];
}

export function inTerritory(s: GameState, idx: number): boolean {
  return hexDist(idx, s.capital, s.W) <= territoryRadius(s.level);
}

export function dateLabel(turn: number): string {
  const year = START_YEAR + Math.floor(turn / 4);
  const q = (turn % 4) + 1;
  return `T${q} ${year}`;
}

export interface NewGameOptions {
  seed?: number;
  listName?: string;
  platform?: string;
  color?: string;
  sandbox?: boolean;
  park?: boolean;
}

export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
  const { tiles, capital } = generateMap(seed, MAP_W, MAP_H);
  const platform = PLATFORMS.find((p) => p.id === opts.platform) ?? PLATFORMS[0];
  const rng = makeRng(seed ^ 0xabcdef);
  const districtW: number[][] = [];
  for (let d = 0; d < 7; d++) {
    const raw = Array.from({ length: 5 }, () => 0.5 + rng());
    const mean = raw.reduce((a, b) => a + b, 0) / 5;
    districtW.push(raw.map((v) => v / mean));
  }
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: (seed * 2654435761) >>> 0,
    W: MAP_W,
    H: MAP_H,
    tiles,
    capital,
    turn: 0,
    level: 0,
    treasury: 1500,
    loans: [],
    nextId: 1,
    pop: opts.park ? 0 : 300,
    satisfaction: 60,
    wellbeing: 60,
    rates: { income: 8, corp: 8, property: 8, transit: 18, toll: 1.5, entry: 12, plane: 60 },
    funding: { education: 1, health: 1, safety: 1, culture: 1, environment: 1, transport: 1 },
    policies: [],
    policyRate: 3,
    macro: { cycle: 0, inflation: 1.5, costIndex: 1, baseRate: 2.5 },
    bankStability: 70,
    parties: PARTIES.map((p) => ({ ...p, ideo: [...p.ideo] })),
    playerList: { name: opts.listName?.trim() || (opts.park ? 'Mon parc' : 'Concorde citoyenne'), color: opts.color || '#2b7de9', ideo: [...platform.ideo] },
    districtW,
    settings: { voteSystem: 'majoritaire', mandateQ: 16, ric: false },
    sandbox: !!opts.sandbox || !!opts.park,
    park: !!opts.park,
    nextElection: 16,
    lastElection: null,
    electionHistory: [],
    cohabitation: false,
    campaign: 0,
    councilSeats: {},
    proposals: [],
    nextProposalTurn: 4,
    fundraisers: [],
    customBuildings: [],
    fleet: { buses: 0, trains: 0, planes: 0 },
    lastReferendum: -10,
    referendums: [],
    unlocks: {},
    levelReady: false,
    levelStreak: 0,
    log: [],
    history: [],
  };
  seedStartingTown(s);
  if (s.park) {
    s.log.push({ turn: 0, kind: 'info', text: `Bienvenue à ${s.playerList.name} ! Construisez des attractions, fixez le prix du billet d’entrée et faites venir les visiteurs.` });
  } else {
    s.log.push({ turn: 0, kind: 'info', text: `Bienvenue, ${s.playerList.name} ! Votre commune compte ${s.pop} habitants. Bâtissez, équilibrez le budget et rendez la vie meilleure.` });
    if (s.sandbox) s.log.push({ turn: 0, kind: 'info', text: 'Mode entraînement libre activé : pas d’élections ni de cohabitation, et tous les bâtiments sont débloqués dès maintenant (prix normal, terrain compatible requis).' });
  }
  return s;
}

function placeBuilding(s: GameState, idx: number, id: string) {
  s.tiles[idx].building = id;
  s.tiles[idx].build = 0;
  if (s.tiles[idx].terrain === 'forest' && id !== 'parc') s.tiles[idx].terrain = 'plain';
}

function seedStartingTown(s: GameState) {
  const { W, H } = s;
  placeBuilding(s, s.capital, s.park ? 'entree_parc' : 'mairie');
  // Axe routier est-ouest
  const roads: number[] = [];
  const walk = (dirIndexParity: boolean) => {
    let cur = s.capital;
    for (let k = 0; k < 5; k++) {
      const row = Math.floor(cur / W);
      const col = cur % W;
      const nc = col + (dirIndexParity ? 1 : -1);
      if (nc < 0 || nc >= W) break;
      const nxt = row * W + nc;
      if (s.tiles[nxt].terrain === 'water' || s.tiles[nxt].terrain === 'mountain') break;
      s.tiles[nxt].infra = 'road';
      roads.push(nxt);
      cur = nxt;
    }
  };
  walk(true);
  walk(false);
  const order = s.park
    ? ['maneges_enfants', 'grande_roue', 'stand_glaces', 'toilettes', 'solaire', 'parking_parc']
    : ['pavillons', 'pavillons', 'pavillons', 'ecole', 'clinique', 'ferme', 'atelier', 'commerces', 'solaire', 'commissariat'];
  const candidates: number[] = [];
  for (const r of roads.concat([s.capital])) {
    for (const n of neighborsOf(r, W, H)) {
      if (!candidates.includes(n) && n !== s.capital && !s.tiles[n].building && s.tiles[n].infra === 'none') candidates.push(n);
    }
  }
  for (const id of order) {
    const def = B[id];
    const k = candidates.findIndex((c) => def.terrains.includes(s.tiles[c].terrain) && !s.tiles[c].building);
    if (k >= 0) {
      placeBuilding(s, candidates[k], id);
      candidates.splice(k, 1);
    }
  }
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(raw: string): GameState | null {
  try {
    const s = JSON.parse(raw) as GameState;
    if (!s || s.version !== SAVE_VERSION || !Array.isArray(s.tiles)) return null;
    if (s.rates.transit === undefined) s.rates.transit = 18;
    if (s.rates.toll === undefined) s.rates.toll = 1.5;
    if (s.rates.entry === undefined) s.rates.entry = 12;
    if (s.rates.plane === undefined) s.rates.plane = 60;
    if (!s.fundraisers) s.fundraisers = [];
    if (s.park === undefined) s.park = false;
    if (!s.customBuildings) s.customBuildings = [];
    if (!s.fleet) s.fleet = { buses: 0, trains: 0, planes: 0 };
    if (s.fleet.planes === undefined) s.fleet.planes = 0;
    for (const def of s.customBuildings) registerCustomBuilding(def);
    return s;
  } catch {
    return null;
  }
}

export function pushLog(s: GameState, kind: 'good' | 'bad' | 'info' | 'vote', text: string) {
  s.log.push({ turn: s.turn, kind, text });
  if (s.log.length > 250) s.log.splice(0, s.log.length - 250);
}

export { rand };
