import { describe, expect, it } from 'vitest';
import { detectCombo } from '../src/combos.js';
import { canBeat, canForceBust, getForcedBustOptions } from '../src/compareCombos.js';
import type { Card } from '../src/types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const combo = (cards: Card[]) => detectCombo(cards)!;

describe('canBeat — normal same-type comparisons', () => {
  it('a higher single beats a lower single', () => {
    expect(canBeat(combo([c('5', 'SPADE')]), combo([c('9', 'SPADE')]))).toBe(true);
  });

  it('a lower single cannot beat a higher single', () => {
    expect(canBeat(combo([c('9', 'SPADE')]), combo([c('5', 'SPADE')]))).toBe(false);
  });

  it('same-rank single is decided by suit', () => {
    expect(canBeat(combo([c('5', 'SPADE')]), combo([c('5', 'HEART')]))).toBe(true);
    expect(canBeat(combo([c('5', 'HEART')]), combo([c('5', 'SPADE')]))).toBe(false);
  });

  it('a pair cannot beat a single (mismatched types)', () => {
    expect(canBeat(combo([c('5', 'SPADE')]), combo([c('9', 'SPADE'), c('9', 'CLUB')]))).toBe(false);
  });

  it('a longer straight cannot beat a shorter straight even with higher cards', () => {
    const shortStraight = combo([c('3', 'SPADE'), c('4', 'CLUB'), c('5', 'DIAMOND')]);
    const longerStraight = combo([c('6', 'SPADE'), c('7', 'CLUB'), c('8', 'DIAMOND'), c('9', 'HEART')]);
    expect(canBeat(shortStraight, longerStraight)).toBe(false);
  });
});

describe('a higher-suited Two beats a lower-suited Two normally (not a bomb, 9.5)', () => {
  it('single Two of Hearts beats single Two of Spades', () => {
    expect(canBeat(combo([c('2', 'SPADE')]), combo([c('2', 'HEART')]))).toBe(true);
  });
});

describe('quad of Twos is unbeatable (9.4)', () => {
  it('nothing beats four 2s, including a pair-chain bomb', () => {
    const quadTwos = combo([c('2', 'SPADE'), c('2', 'CLUB'), c('2', 'DIAMOND'), c('2', 'HEART')]);
    const bigPairChain = combo([
      c('3', 'SPADE'),
      c('3', 'CLUB'),
      c('4', 'SPADE'),
      c('4', 'CLUB'),
      c('5', 'SPADE'),
      c('5', 'CLUB'),
      c('6', 'SPADE'),
      c('6', 'CLUB'),
    ]);
    expect(canBeat(quadTwos, bigPairChain)).toBe(false);
  });
});

describe('forced two-bust rules (9.5)', () => {
  it('a single Two can be busted by a four-of-a-kind', () => {
    const singleTwo = combo([c('2', 'SPADE')]);
    const fourOfAKind = combo([c('9', 'SPADE'), c('9', 'CLUB'), c('9', 'DIAMOND'), c('9', 'HEART')]);
    expect(canForceBust(singleTwo, fourOfAKind)).toBe(true);
  });

  it('a single Two can be busted by a 3-pair chain', () => {
    const singleTwo = combo([c('2', 'SPADE')]);
    const threePairChain = combo([
      c('3', 'SPADE'),
      c('3', 'CLUB'),
      c('4', 'SPADE'),
      c('4', 'CLUB'),
      c('5', 'SPADE'),
      c('5', 'CLUB'),
    ]);
    expect(canForceBust(singleTwo, threePairChain)).toBe(true);
  });

  it('a pair of Twos CANNOT be busted by a four-of-a-kind', () => {
    const pairOfTwos = combo([c('2', 'SPADE'), c('2', 'CLUB')]);
    const fourOfAKind = combo([c('9', 'SPADE'), c('9', 'CLUB'), c('9', 'DIAMOND'), c('9', 'HEART')]);
    expect(canForceBust(pairOfTwos, fourOfAKind)).toBe(false);
  });

  it('a pair of Twos CAN be busted by a 4-pair chain, but not a 3-pair chain', () => {
    const pairOfTwos = combo([c('2', 'SPADE'), c('2', 'CLUB')]);
    const threePairChain = combo([
      c('3', 'SPADE'),
      c('3', 'CLUB'),
      c('4', 'SPADE'),
      c('4', 'CLUB'),
      c('5', 'SPADE'),
      c('5', 'CLUB'),
    ]);
    const fourPairChain = combo([
      c('3', 'SPADE'),
      c('3', 'CLUB'),
      c('4', 'SPADE'),
      c('4', 'CLUB'),
      c('5', 'SPADE'),
      c('5', 'CLUB'),
      c('6', 'SPADE'),
      c('6', 'CLUB'),
    ]);
    expect(canForceBust(pairOfTwos, threePairChain)).toBe(false);
    expect(canForceBust(pairOfTwos, fourPairChain)).toBe(true);
  });

  it('getForcedBustOptions returns only qualifying bombs, ignoring non-bomb combos', () => {
    const singleTwo = combo([c('2', 'SPADE')]);
    const available = [
      combo([c('9', 'SPADE'), c('9', 'CLUB'), c('9', 'DIAMOND'), c('9', 'HEART')]), // qualifies
      combo([c('3', 'SPADE'), c('3', 'CLUB'), c('4', 'SPADE'), c('4', 'CLUB'), c('5', 'SPADE'), c('5', 'CLUB')]), // qualifies
      combo([c('8', 'HEART')]), // does not qualify (not a bomb)
    ];
    const forced = getForcedBustOptions(singleTwo, available);
    expect(forced.length).toBe(2);
  });
});

describe('bomb vs bomb (9.4)', () => {
  it('a four-of-a-kind of higher rank beats a lower one', () => {
    const low = combo([c('9', 'SPADE'), c('9', 'CLUB'), c('9', 'DIAMOND'), c('9', 'HEART')]);
    const high = combo([c('J', 'SPADE'), c('J', 'CLUB'), c('J', 'DIAMOND'), c('J', 'HEART')]);
    expect(canBeat(low, high)).toBe(true);
  });

  it('a longer pair chain does NOT beat a shorter one — chains only compare at equal length (9.4)', () => {
    const shortHighRank = combo([
      c('J', 'SPADE'),
      c('J', 'CLUB'),
      c('Q', 'SPADE'),
      c('Q', 'CLUB'),
      c('K', 'SPADE'),
      c('K', 'CLUB'),
    ]);
    const longerLowRank = combo([
      c('3', 'SPADE'),
      c('3', 'CLUB'),
      c('4', 'SPADE'),
      c('4', 'CLUB'),
      c('5', 'SPADE'),
      c('5', 'CLUB'),
      c('6', 'SPADE'),
      c('6', 'CLUB'),
    ]);
    expect(canBeat(shortHighRank, longerLowRank)).toBe(false);
    // ...and the shorter one cannot answer the longer one either.
    expect(canBeat(longerLowRank, shortHighRank)).toBe(false);
  });

  it('a four-of-a-kind cannot beat a three-pair chain (families never cross, 9.4)', () => {
    const threePairChain = combo([
      c('7', 'SPADE'),
      c('7', 'CLUB'),
      c('8', 'SPADE'),
      c('8', 'CLUB'),
      c('9', 'SPADE'),
      c('9', 'CLUB'),
    ]);
    const aceQuad = combo([c('A', 'SPADE'), c('A', 'CLUB'), c('A', 'DIAMOND'), c('A', 'HEART')]);
    expect(canBeat(threePairChain, aceQuad)).toBe(false);
  });

  it('same-length pair chains compare by top rank', () => {
    const lowChain = combo([
      c('3', 'SPADE'),
      c('3', 'CLUB'),
      c('4', 'SPADE'),
      c('4', 'CLUB'),
      c('5', 'SPADE'),
      c('5', 'CLUB'),
    ]);
    const highChain = combo([
      c('6', 'SPADE'),
      c('6', 'CLUB'),
      c('7', 'SPADE'),
      c('7', 'CLUB'),
      c('8', 'SPADE'),
      c('8', 'CLUB'),
    ]);
    expect(canBeat(lowChain, highChain)).toBe(true);
    expect(canBeat(highChain, lowChain)).toBe(false);
  });

  it('a four-of-a-kind and a pair chain never compare directly against each other', () => {
    const fourOfAKind = combo([c('9', 'SPADE'), c('9', 'CLUB'), c('9', 'DIAMOND'), c('9', 'HEART')]);
    const pairChain = combo([
      c('3', 'SPADE'),
      c('3', 'CLUB'),
      c('4', 'SPADE'),
      c('4', 'CLUB'),
      c('5', 'SPADE'),
      c('5', 'CLUB'),
    ]);
    expect(canBeat(fourOfAKind, pairChain)).toBe(false);
    expect(canBeat(pairChain, fourOfAKind)).toBe(false);
  });
});

describe('bombs cannot beat ordinary non-Two piles', () => {
  it('a four-of-a-kind cannot be played on top of an ordinary single', () => {
    const ordinarySingle = combo([c('5', 'SPADE')]);
    const fourOfAKind = combo([c('9', 'SPADE'), c('9', 'CLUB'), c('9', 'DIAMOND'), c('9', 'HEART')]);
    expect(canBeat(ordinarySingle, fourOfAKind)).toBe(false);
  });
});
