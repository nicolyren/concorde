import { describe, expect, it } from 'vitest';
import { newGame, serialize, deserialize } from '../src/core/state';
import { computeMetrics, endTurn } from '../src/core/sim';
import { hexDist } from '../src/core/hex';
import { play } from './bot';

describe('carte', () => {
  it('la capitale est en plaine et le voisinage est majoritairement terrestre', () => {
    for (const seed of [1, 2, 3, 42, 1234, 99999]) {
      const s = newGame({ seed });
      expect(s.tiles[s.capital].terrain).toBe('plain');
      let land = 0, tot = 0;
      s.tiles.forEach((t, i) => {
        if (hexDist(i, s.capital, s.W) <= 8) { tot++; if (t.terrain !== 'water') land++; }
      });
      expect(land / tot).toBeGreaterThan(0.6);
    }
  });
});

describe('simulation', () => {
  it('une nouvelle partie démarre avec des indicateurs sains', () => {
    const s = newGame({ seed: 7 });
    const m = computeMetrics(s);
    expect(m.wellbeing).toBeGreaterThan(40);
    expect(m.wellbeing).toBeLessThanOrEqual(100);
    expect(Number.isFinite(m.revenue.total)).toBe(true);
    expect(m.operatingBalance).toBeGreaterThan(-200);
  });
  it('est déterministe', () => {
    const a = newGame({ seed: 5 });
    const b = newGame({ seed: 5 });
    for (let i = 0; i < 20; i++) { endTurn(a); endTurn(b); }
    expect(serialize(a)).toBe(serialize(b));
  });
  it('sérialise sans perte', () => {
    const s = newGame({ seed: 9 });
    play(s, 10);
    const r = deserialize(serialize(s))!;
    expect(r.turn).toBe(s.turn);
    expect(r.tiles.length).toBe(s.tiles.length);
  });
  it('une partie automatique de 100 trimestres reste cohérente', () => {
    const s = newGame({ seed: 11 });
    play(s, 100);
    const m = computeMetrics(s);
    console.log('pop', s.pop, 'wb', m.wellbeing.toFixed(1), 'sat', s.satisfaction.toFixed(1), 'treasury', Math.round(s.treasury), 'level', s.level, 'debt', Math.round(m.debt), 'elections', s.electionHistory.map(e => `${e.turn}:${e.playerWon ? 'W' : 'L'}${(e.playerShare*100).toFixed(0)}`).join(' '));
    expect(Number.isFinite(s.pop) && Number.isFinite(s.treasury)).toBe(true);
    expect(s.pop).toBeGreaterThan(1000);
    expect(s.electionHistory.length).toBeGreaterThanOrEqual(4);
    for (const e of s.electionHistory) expect(e.playerShare).toBeGreaterThan(0);
    const le = s.lastElection!;
    expect(Object.values(le.seats).reduce((a, b) => a + b, 0)).toBe(le.totalSeats);
  });
});
