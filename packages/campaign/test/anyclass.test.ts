import { describe, expect, it } from 'vitest';
import { createRng } from '@big-two/engine';
import {
  anteFor,
  beginHand,
  buyInFor,
  finishHand,
  openTable,
  PLAYER_SEAT,
  SEAT_IDS,
  SHOWDOWN_ANTE,
  tableOption,
  you,
  type Held,
  type TableState,
} from '../src/index.js';

/** The Medallions any class can carry: about gold, not cards. */

const others = SEAT_IDS.filter((id) => id !== PLAYER_SEAT);
const youFirst = { placing: [PLAYER_SEAT, ...others], wentOutWith: {} };
const youLast = { placing: [...others, PLAYER_SEAT], wentOutWith: {} };
const option = tableOption(createRng('any'), { tier: 1, classId: 'courtier', archetype: 'modest', id: 'any' });

function sit(medallions: Held[], worth = 400, lastRitesUsed = false): TableState {
  return openTable(option, { classId: 'courtier', worth, medallions, lastRitesUsed });
}

function play(table: TableState, result: typeof youFirst) {
  return finishHand(beginHand(table, false), result, createRng('hand'));
}

describe('any-class Medallions', () => {
  it("Ferryman's Coin: a Showdown at two antes", () => {
    const plain = sit([]);
    const coin = sit([{ id: 'ferrymans-coin', level: 1 }]);
    expect(anteFor(plain, you(plain), true)).toBe(anteFor(plain, you(plain)) * SHOWDOWN_ANTE);
    expect(anteFor(coin, you(coin), true)).toBe(anteFor(coin, you(coin)) * (SHOWDOWN_ANTE - 1));
  });

  it('Hoard: a buy-in an ante cheaper', () => {
    expect(buyInFor(option, [{ id: 'hoard', level: 1 }])).toBe(option.buyIn - option.ante);
    expect(sit([{ id: 'hoard', level: 1 }], 900).stakes.you).toBe(option.buyIn - option.ante);
  });

  it('Tithe: first place takes an ante from every other seat', () => {
    const plain = play(sit([]), youFirst);
    const tithe = play(sit([{ id: 'tithe', level: 1 }]), youFirst);
    const extra = tithe.outcome.ledger[PLAYER_SEAT]!.net - plain.outcome.ledger[PLAYER_SEAT]!.net;
    expect(extra).toBeGreaterThan(0);
    expect(tithe.outcome.effects).toEqual([{ seat: PLAYER_SEAT, medallion: 'tithe', amount: extra }]);
  });

  it('Iron Stomach: half back for finishing last, once a table', () => {
    const table = sit([{ id: 'iron-stomach', level: 1 }]);
    const once = play(table, youLast);
    expect(once.outcome.effects[0]?.medallion).toBe('iron-stomach');
    const twice = play(once.table, youLast);
    expect(twice.outcome.effects).toEqual([]);
  });

  it('Last Rites: three antes instead of nothing, once a run', () => {
    const thin = (t: TableState) => ({
      ...t,
      seats: t.seats.map((s) => (s.id === PLAYER_SEAT ? { ...s, worth: anteFor(t, s) } : s)),
    });
    const saved = play(thin(sit([{ id: 'last-rites', level: 1 }])), youLast);
    expect(you(saved.table).worth).toBe(3 * anteFor(saved.table, you(saved.table)));
    expect(saved.outcome.end).toBeNull();
    const spent = play(thin(sit([{ id: 'last-rites', level: 1 }], 400, true)), youLast);
    expect(spent.outcome.end?.kind).toBe('broke');
  });
});
