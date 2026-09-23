import { describe, expect, it } from 'vitest';
import { applySettlement, HAND_WEIGHTS, openPot, raise, settlePot, STAKE_WEIGHTS } from '../src/economy.js';

/** Pots: the split by placement, matched raises, and all-in's cap. */

const ORDER = ['a', 'b', 'c', 'd'];
const total = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);

describe('settling a pot', () => {
  it('splits an even pot 70/25/5/0 by placement, as the table prize does', () => {
    const payout = settlePot({ a: 25, b: 25, c: 25, d: 25 }, ORDER, HAND_WEIGHTS);
    expect(payout).toEqual({ a: 70, b: 25, c: 5, d: 0 });
    expect(HAND_WEIGHTS).toEqual(STAKE_WEIGHTS);
  });

  it('never makes or loses a coin', () => {
    const contributions = { a: 37, b: 91, c: 13, d: 60 };
    for (const weights of [HAND_WEIGHTS, STAKE_WEIGHTS]) {
      expect(total(settlePot(contributions, ['c', 'a', 'd', 'b'], weights))).toBe(total(contributions));
    }
  });

  it('caps an all-in seat at what it could cover from each other seat', () => {
    // a is all-in for 10 and wins; the 30 above that is b, c and d's alone.
    const payout = settlePot({ a: 10, b: 40, c: 40, d: 40 }, ORDER, HAND_WEIGHTS);
    // The main pot of 40 pays a 70% of it (28); nobody can pay a more than 4 × 10.
    expect(payout.a).toBe(28);
    expect(payout.a).toBeLessThanOrEqual(40);
    // The side pot of 90 is split 70:25:5 among b, c and d.
    expect(payout.b! + payout.c! + payout.d!).toBe(130 - payout.a!);
    expect(payout.b).toBeGreaterThan(payout.c!);
  });

  it('pays a table prize 70/25/5/0, nothing to last', () => {
    expect(settlePot({ a: 100, b: 100, c: 100, d: 100 }, ORDER, STAKE_WEIGHTS)).toEqual({
      a: 280,
      b: 100,
      c: 20,
      d: 0,
    });
  });

  it('gives nothing to a seat past the end of the curve', () => {
    const payout = settlePot({ a: 50, b: 50, c: 50, d: 50, gone: 50 }, [...ORDER, 'gone'], STAKE_WEIGHTS);
    expect(payout.gone).toBe(0);
    expect(total(payout)).toBe(250);
  });
});

describe('a hand pot', () => {
  const worth = { a: 100, b: 100, c: 15, d: 100 };

  it('takes the ante, and puts a seat that cannot cover it all-in', () => {
    const pot = openPot({ ...worth, c: 5 }, { a: 10, b: 10, c: 10, d: 10 });
    expect(pot.contributions).toEqual({ a: 10, b: 10, c: 5, d: 10 });
    expect(pot.allIn).toEqual(['c']);
  });

  it('has every seat still playing match a raise', () => {
    const pot = raise(openPot(worth, { a: 10, b: 10, c: 10, d: 10 }), worth, 'a', 20, ['a', 'b', 'c', 'd']);
    expect(pot.contributions).toEqual({ a: 30, b: 30, c: 15, d: 30 });
    expect(pot.allIn).toEqual(['c']);
    expect(pot.raises).toEqual({ a: 1 });
  });

  it('leaves a seat already out of the hand out of the raise', () => {
    const pot = raise(openPot(worth, { a: 10, b: 10, c: 10, d: 10 }), worth, 'a', 20, ['a', 'b', 'c']);
    expect(pot.contributions.d).toBe(10);
  });

  it('turns contributions and payouts into new Worth', () => {
    expect(applySettlement({ a: 100, b: 100 }, { a: 30, b: 30 }, { a: 60, b: 0 })).toEqual({ a: 130, b: 70 });
  });

  it('makes a raise worth making when you finish first', () => {
    const antes = { a: 10, b: 10, c: 10, d: 10 };
    const flat = settlePot(openPot(worth, antes).contributions, ORDER, HAND_WEIGHTS).a! - 10;
    const raised = raise(
      openPot({ a: 100, b: 100, c: 100, d: 100 }, antes),
      { a: 100, b: 100, c: 100, d: 100 },
      'a',
      20,
      ORDER,
    );
    const withRaise = settlePot(raised.contributions, ORDER, HAND_WEIGHTS).a! - 30;
    expect(withRaise).toBeGreaterThan(flat);
  });
});
