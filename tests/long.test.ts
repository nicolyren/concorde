import { it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { computeMetrics, endTurn } from '../src/core/sim';
import { botTurn } from './bot';
it('long run', () => {
  const s = newGame({ seed: 21 });
  for (let t = 0; t < 240; t++) {
    for (let k = 0; k < 4; k++) botTurn(s);
    endTurn(s);
    if (t % 20 === 0) {
      const m = computeMetrics(s);
      console.log('T', t, 'L', s.level, 'pop', s.pop, 'cap', Math.round(m.housingCap), 'wb', m.wellbeing.toFixed(0), 'sat', s.satisfaction.toFixed(0), 'tre', Math.round(s.treasury), 'rev', Math.round(m.revenue.total), 'op', Math.round(m.expenses.operating), 'unemp', m.unemployment.toFixed(2), 'ready', s.levelReady, 'infl', s.macro.inflation.toFixed(1), 'ci', s.macro.costIndex.toFixed(2));
    }
  }
  expect(Number.isFinite(s.treasury)).toBe(true);
});
