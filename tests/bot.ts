import { B } from '../src/core/content';
import { buildBuilding, buildInfra, canBuildBuilding, enactPolicy, levelUp, takeLoan } from '../src/core/actions';
import { neighborsOf, hexDist } from '../src/core/hex';
import { computeMetrics, endTurn } from '../src/core/sim';
import { inTerritory } from '../src/core/state';
import type { GameState } from '../src/core/types';

/** Joueur automatique simple, pour tester l'équilibrage. */
export function botTurn(s: GameState) {
  const m = computeMetrics(s);
  const need: string[] = [];
  const c = m.counts;
  const cnt = (id: string) => c[id] ?? 0;
  const under = (v: number, th: number) => v < th;
  const housingId = s.level >= 1 ? 'tours' : s.pop > 1500 ? 'immeubles' : 'pavillons';
  if (m.pop > 0.75 * m.housingCap) need.push(housingId);
  if (m.unemployment > 0.08) need.push(s.level >= 1 && m.pop > 6000 ? 'bureaux' : 'commerces');
  if (m.banks === 0 && s.treasury > 600) need.push('banque_locale');
  if (under(m.idx.energy, 98)) need.push(s.level >= 1 ? 'geothermie' : 'solaire');
  if (under(m.idx.edu, 85)) need.push(cnt('ecole') * 500 < s.pop * 0.12 ? 'ecole' : s.level >= 1 && cnt('univ') * 1000 < s.pop * 0.05 ? 'univ' : 'college');
  if (cnt('clinique') * 1500 + cnt('hopital') * 6000 < s.pop * 1.1) need.push(s.level >= 1 && s.pop > 8000 ? 'hopital' : 'clinique');
  if (cnt('commissariat') * 3000 + cnt('pompiers') * 5000 < s.pop * 1.1) need.push('commissariat');
  if (under(m.idx.culture, 80)) need.push('biblio');
  if (under(m.idx.env, 70)) need.push('parc');
  if (under(m.idx.mobility, 70)) need.push('depot');
  need.push(housingId);
  for (const id of need) {
    if (B[id].level > s.level) continue;
    if (B[id].cost * s.macro.costIndex > s.treasury - 100) continue;
    // cherche une tuile desservie
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < s.tiles.length; i++) {
      if (!inTerritory(s, i)) continue;
      if (!canBuildBuilding(s, id, i).ok) continue;
      const adj = neighborsOf(i, s.W, s.H).some((j) => s.tiles[j].infra === 'road' || s.tiles[j].infra === 'highway' || j === s.capital);
      const d = hexDist(i, s.capital, s.W) + (adj ? 0 : 6);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) {
      if (!neighborsOf(best, s.W, s.H).some((j) => s.tiles[j].infra === 'road' || s.tiles[j].infra === 'highway' || j === s.capital)) {
        // prolonge une route depuis la tuile voisine la plus proche du réseau
        const nb = neighborsOf(best, s.W, s.H).filter((j) => !s.tiles[j].building && s.tiles[j].terrain !== 'water');
        let bj = -1, bdd = 1e9;
        for (const j of nb) {
          const dd = hexDist(j, s.capital, s.W);
          if (dd < bdd) { bdd = dd; bj = j; }
        }
        if (bj >= 0) buildInfra(s, bj, 'road');
        // relie bj au réseau en marchant vers la mairie
        let cur = bj;
        for (let k = 0; k < 12 && cur >= 0; k++) {
          const nn = neighborsOf(cur, s.W, s.H).filter((j) => s.tiles[j].terrain !== 'water' && !s.tiles[j].building);
          if (nn.some((j) => s.tiles[j].infra === 'road') ) break;
          let nx = -1, nd = hexDist(cur, s.capital, s.W);
          for (const j of nn) { const dd = hexDist(j, s.capital, s.W); if (dd < nd) { nd = dd; nx = j; } }
          if (nx < 0) break;
          buildInfra(s, nx, 'road');
          cur = nx;
        }
      }
      buildBuilding(s, best, id);
    }
  }
  if (s.treasury < 150 && m.banks > 0) takeLoan(s, Math.min(m.creditAvailable, 500), 8);
  for (const p of ['budget_participatif', 'plan_climat', 'cantine']) if (s.treasury > 800) enactPolicy(s, p);
  if (s.levelReady) levelUp(s);
}

export function play(s: GameState, turns: number) {
  for (let i = 0; i < turns; i++) {
    botTurn(s);
    endTurn(s);
  }
}
