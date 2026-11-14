import { hexDist, neighborsOf, planarPos } from './hex';
import { makeRng } from './rng';
import type { Terrain, Tile } from './types';
import { DISTRICT_NAMES } from './content';

function makeNoise(rng: () => number, cell: number, W: number, H: number) {
  const gw = Math.ceil(W / cell) + 3;
  const gh = Math.ceil(H / cell) + 3;
  const grid = Array.from({ length: gw * gh }, () => rng());
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const gx = x / cell;
    const gy = y / cell;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = sm(gx - x0);
    const fy = sm(gy - y0);
    const g = (ix: number, iy: number) => grid[iy * gw + ix];
    const a = g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx;
    const b = g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx;
    return a * (1 - fy) + b * fy;
  };
}

export interface GeneratedMap {
  tiles: Tile[];
  capital: number;
}

export function generateMap(seed: number, W: number, H: number): GeneratedMap {
  const rng = makeRng(seed ^ 0x9e3779b9);
  const n1 = makeNoise(rng, 7, W, H);
  const n2 = makeNoise(rng, 3.5, W, H);
  const n3 = makeNoise(rng, 1.8, W, H);
  const m1 = makeNoise(rng, 5, W, H);
  const cx = W / 2;
  const cy = (H * 0.866) / 2;
  const maxd = Math.min(cx, cy) * 1.15;
  const tiles: Tile[] = [];
  for (let i = 0; i < W * H; i++) {
    const p = planarPos(i, W);
    const f = 0.55 * n1(p.x, p.y) + 0.3 * n2(p.x, p.y) + 0.15 * n3(p.x, p.y);
    const d = Math.min(1.4, Math.hypot(p.x - cx, (p.y - cy) * 1.15) / maxd);
    const e = 0.6 * f + 0.4 * (1 - Math.pow(d, 1.6));
    const moist = m1(p.x + 40, p.y + 17);
    let terrain: Terrain;
    if (e < 0.38) terrain = 'water';
    else if (e < 0.66) terrain = moist > 0.56 ? 'forest' : 'plain';
    else if (e < 0.8) terrain = moist > 0.62 ? 'forest' : 'hill';
    else terrain = 'mountain';
    tiles.push({ terrain, infra: 'none', building: null, build: 0, zone: 'free', district: 0 });
  }
  // Capitale : tuile centrale, en plaine
  let capital = Math.floor(H / 2) * W + Math.floor(W / 2);
  tiles[capital].terrain = 'plain';
  // Adoucit le voisinage immédiat : pas d'eau/montagne à moins de 3 cases
  for (let i = 0; i < tiles.length; i++) {
    const d = hexDist(i, capital, W);
    if (d <= 3 && (tiles[i].terrain === 'water' || tiles[i].terrain === 'mountain')) tiles[i].terrain = 'plain';
    else if (d <= 2 && tiles[i].terrain !== 'plain') tiles[i].terrain = 'plain';
  }
  // Lisse les tuiles d'eau isolées
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].terrain === 'water') {
      const nb = neighborsOf(i, W, H);
      if (nb.filter((j) => tiles[j].terrain !== 'water').length >= 5) tiles[i].terrain = 'plain';
    }
  }
  // Districts : centre + 6 secteurs
  const cp = planarPos(capital, W);
  for (let i = 0; i < tiles.length; i++) {
    if (hexDist(i, capital, W) <= 2) {
      tiles[i].district = 0;
      continue;
    }
    const p = planarPos(i, W);
    const deg = (Math.atan2(p.y - cp.y, p.x - cp.x) * 180) / Math.PI;
    const k = Math.floor((((deg + 120) % 360) + 360) % 360 / 60);
    tiles[i].district = 1 + k;
  }
  return { tiles, capital };
}

export function districtName(d: number): string {
  return d === 0 ? 'Centre' : `Secteur ${DISTRICT_NAMES[d]}`;
}
