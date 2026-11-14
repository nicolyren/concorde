/** Générateur pseudo-aléatoire sérialisable (mulberry32 sur un état entier). */
export function rand(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function makeRng(seed: number): () => number {
  const st = { rng: seed >>> 0 };
  return () => rand(st);
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Approximation gaussienne (somme de 3 uniformes), centrée, écart-type ≈ 1 */
export function gauss(s: { rng: number }): number {
  return (rand(s) + rand(s) + rand(s) - 1.5) * 2;
}
