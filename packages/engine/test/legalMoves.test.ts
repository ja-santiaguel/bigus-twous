import { describe, expect, it } from 'vitest';
import { detectCombo } from '../src/combos.js';
import { getForcedLowestSingle, getLegalMoves, mustPlay } from '../src/legalMoves.js';
import type { Card } from '../src/types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const combo = (cards: Card[]) => detectCombo(cards)!;

describe('getLegalMoves — leading a fresh trick', () => {
  it('returns every combo the hand can form when pile is null', () => {
    const hand = [c('3', 'SPADE'), c('3', 'CLUB'), c('9', 'HEART')];
    const legal = getLegalMoves(hand, null);
    expect(legal.some((m) => m.type === 'SINGLE')).toBe(true);
    expect(legal.some((m) => m.type === 'PAIR')).toBe(true);
  });

  it('mustPlay is true when leading (pile is null)', () => {
    expect(mustPlay(null)).toBe(true);
  });
});

describe('getLegalMoves — normal counters', () => {
  it('only returns combos of the same type/length that beat the pile', () => {
    const hand = [c('5', 'SPADE'), c('9', 'CLUB'), c('K', 'DIAMOND')];
    const pile = combo([c('7', 'SPADE')]);
    const legal = getLegalMoves(hand, pile);
    expect(legal.map((m) => m.cards[0]!.rank).sort()).toEqual(['9', 'K']);
  });

  it('returns an empty array when nothing in hand can beat the pile', () => {
    const hand = [c('3', 'SPADE'), c('4', 'CLUB')];
    const pile = combo([c('2', 'HEART')]); // highest single in the game, no bomb in hand
    expect(getLegalMoves(hand, pile)).toEqual([]);
  });
});

describe('getLegalMoves — forced two-bust overrides normal play', () => {
  it('when a qualifying bomb is in hand, ONLY bombs are legal — not a higher-suited Two', () => {
    const hand = [
      c('2', 'HEART'), // would normally beat 2-SPADE via suit
      c('9', 'SPADE'),
      c('9', 'CLUB'),
      c('9', 'DIAMOND'),
      c('9', 'HEART'), // four-of-a-kind bomb, qualifies to bust a single Two
    ];
    const pile = combo([c('2', 'SPADE')]);
    const legal = getLegalMoves(hand, pile);
    expect(legal.length).toBe(1);
    expect(legal[0]!.type).toBe('FOUR_OF_A_KIND');
  });

  it('falls back to a higher-suited Two when no qualifying bomb is available', () => {
    const hand = [c('2', 'HEART'), c('4', 'SPADE'), c('5', 'CLUB')];
    const pile = combo([c('2', 'SPADE')]);
    const legal = getLegalMoves(hand, pile);
    expect(legal.length).toBe(1);
    expect(legal[0]).toEqual(combo([c('2', 'HEART')]));
  });
});

describe('getForcedLowestSingle', () => {
  it('returns the single lowest card in hand', () => {
    const hand = [c('9', 'SPADE'), c('3', 'SPADE'), c('K', 'HEART')];
    const forced = getForcedLowestSingle(hand);
    expect(forced).toEqual({ type: 'SINGLE', cards: [c('3', 'SPADE')], strength: expect.any(Number) });
  });
});
