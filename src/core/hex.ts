/** Grille hexagonale « pointy-top » en coordonnées décalées (odd-r). Index = row * W + col. */
export const SQ3 = Math.sqrt(3);

const EVEN: [number, number][] = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
const ODD: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

export function colOf(i: number, W: number): number {
  return i % W;
}
export function rowOf(i: number, W: number): number {
  return Math.floor(i / W);
}

export function neighborsOf(i: number, W: number, H: number): number[] {
  const col = i % W;
  const row = Math.floor(i / W);
  const dirs = row & 1 ? ODD : EVEN;
  const out: number[] = [];
  for (const [dc, dr] of dirs) {
    const c = col + dc;
    const r = row + dr;
    if (c >= 0 && c < W && r >= 0 && r < H) out.push(r * W + c);
  }
  return out;
}

export function cubeOf(i: number, W: number): { x: number; y: number; z: number } {
  const col = i % W;
  const row = Math.floor(i / W);
  const x = col - ((row - (row & 1)) >> 1);
  return { x, y: -x - row, z: row };
}

export function hexDist(a: number, b: number, W: number): number {
  const p = cubeOf(a, W);
  const q = cubeOf(b, W);
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z));
}

export function hexToPixel(i: number, W: number, size: number): { x: number; y: number } {
  const col = i % W;
  const row = Math.floor(i / W);
  return { x: size * SQ3 * (col + 0.5 * (row & 1)), y: size * 1.5 * row };
}

export function pixelToHex(px: number, py: number, size: number, W: number, H: number): number {
  const qf = ((SQ3 / 3) * px - py / 3) / size;
  const rf = ((2 / 3) * py) / size;
  let x = Math.round(qf);
  let z = Math.round(rf);
  let y = Math.round(-qf - rf);
  const dx = Math.abs(x - qf);
  const dy = Math.abs(y - (-qf - rf));
  const dz = Math.abs(z - rf);
  if (dx > dy && dx > dz) x = -y - z;
  else if (dy > dz) y = -x - z;
  else z = -x - y;
  const row = z;
  const col = x + ((row - (row & 1)) >> 1);
  if (col < 0 || col >= W || row < 0 || row >= H) return -1;
  return row * W + col;
}

/** Position « plane » (en unités de largeur d'hexagone) pour le bruit / les secteurs. */
export function planarPos(i: number, W: number): { x: number; y: number } {
  const col = i % W;
  const row = Math.floor(i / W);
  return { x: col + 0.5 * (row & 1), y: row * 0.866 };
}
