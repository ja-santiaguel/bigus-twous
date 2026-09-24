import { describe, expect, it } from 'vitest';
import { createRng } from '@big-two/engine';
import {
  anteFor,
  anteShareOf,
  beginHand,
  finishHand,
  openTable,
  PLAYER_SEAT,
  SEAT_IDS,
  tableOption,
  you,
  type Held,
  type TableState,
} from '../src/index.js';

/** The Wanderer's own Medallions about gold: Low Road and Beggar's Cup. */

const others = SEAT_IDS.filter((id) => id !== PLAYER_SEAT);
const option = tableOption(createRng('wanderer'), { tier: 2, classId: 'commoner', archetype: 'modest', id: 'w' });
const sit = (medallions: Held[]): TableState => openTable(option, { classId: 'commoner', worth: 2000, medallions });
const placed = (place: number) => {
  const placing = [...others];
  placing.splice(place, 0, PLAYER_SEAT);
  return { placing, wentOutWith: {} };
};

describe('the Wanderer’s Medallions', () => {
  it('Low Road: an ante share of ×0.65, then ×0.55', () => {
    expect(anteShareOf('commoner')).toBe(0.75);
    expect(anteShareOf('commoner', [{ id: 'low-road', level: 1 }])).toBeCloseTo(0.65);
    expect(anteShareOf('commoner', [{ id: 'low-road', level: 2 }])).toBeCloseTo(0.55);
    const plain = sit([]);
    const low = sit([{ id: 'low-road', level: 2 }]);
    expect(anteFor(low, you(low))).toBeLessThan(anteFor(plain, you(plain)));
    expect(anteFor(low, you(low))).toBe(Math.round(option.ante * 0.55));
  });

  it("Beggar's Cup: a hand finished third costs nothing", () => {
    const cup = sit([{ id: 'beggars-cup', level: 1 }]);
    const before = you(cup).worth;
    const { table, outcome } = finishHand(beginHand(cup, false), placed(2), createRng('h'));
    expect(you(table).worth).toBe(before);
    expect(outcome.effects.some((e) => e.medallion === 'beggars-cup' && e.seat === PLAYER_SEAT)).toBe(true);
  });

  it("Beggar's Cup: pays nothing for any other place", () => {
    const cup = sit([{ id: 'beggars-cup', level: 1 }]);
    const plain = sit([]);
    for (const place of [0, 1, 3]) {
      const withCup = finishHand(beginHand(cup, false), placed(place), createRng('h')).table;
      const without = finishHand(beginHand(plain, false), placed(place), createRng('h')).table;
      expect(you(withCup).worth - you(cup).worth).toBe(you(without).worth - you(plain).worth);
    }
  });
});
