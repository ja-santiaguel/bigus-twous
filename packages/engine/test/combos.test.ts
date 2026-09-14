import { describe, expect, it } from 'vitest';
import { detectCombo, enumerateCombos } from '../src/combos.js';
import type { Card } from '../src/types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('detectCombo — same-rank combos', () => {
  it('detects a single', () => {
    expect(detectCombo([c('5', 'SPADE')])?.type).toBe('SINGLE');
  });

  it('detects a pair', () => {
    expect(detectCombo([c('7', 'SPADE'), c('7', 'CLUB')])?.type).toBe('PAIR');
  });

  it('detects a triple', () => {
    expect(detectCombo([c('9', 'SPADE'), c('9', 'CLUB'), c('9', 'DIAMOND')])?.type).toBe('TRIPLE');
  });

  it('detects four-of-a-kind', () => {
    const combo = detectCombo([c('J', 'SPADE'), c('J', 'CLUB'), c('J', 'DIAMOND'), c('J', 'HEART')]);
    expect(combo?.type).toBe('FOUR_OF_A_KIND');
  });

  it('rejects mismatched ranks as a pair', () => {
    expect(detectCombo([c('7', 'SPADE'), c('8', 'CLUB')])).toBeNull();
  });
});

describe('detectCombo — straights', () => {
  it('detects a valid 3-card straight', () => {
    const combo = detectCombo([c('4', 'SPADE'), c('5', 'CLUB'), c('3', 'DIAMOND')]);
    expect(combo?.type).toBe('STRAIGHT');
    expect(combo?.length).toBe(3);
  });

  it('rejects a straight shorter than the minimum length', () => {
    expect(detectCombo([c('4', 'SPADE'), c('5', 'CLUB')])).toBeNull();
  });

  it('rejects a straight containing a 2', () => {
    expect(detectCombo([c('A', 'SPADE'), c('2', 'CLUB'), c('K', 'DIAMOND')])).toBeNull();
  });

  it('rejects wraparound straights (Q-K-A-2-3)', () => {
    expect(
      detectCombo([c('Q', 'SPADE'), c('K', 'CLUB'), c('A', 'DIAMOND'), c('2', 'HEART'), c('3', 'SPADE')]),
    ).toBeNull();
  });

  it('rejects non-consecutive ranks', () => {
    expect(detectCombo([c('3', 'SPADE'), c('4', 'CLUB'), c('6', 'DIAMOND')])).toBeNull();
  });

  it('rejects a straight with a duplicate rank', () => {
    expect(detectCombo([c('3', 'SPADE'), c('4', 'CLUB'), c('4', 'DIAMOND')])).toBeNull();
  });
});

describe('detectCombo — pair chains (dây)', () => {
  it('detects a valid 3-pair chain', () => {
    const combo = detectCombo([
      c('4', 'SPADE'),
      c('4', 'CLUB'),
      c('5', 'SPADE'),
      c('5', 'CLUB'),
      c('6', 'SPADE'),
      c('6', 'CLUB'),
    ]);
    expect(combo?.type).toBe('PAIR_CHAIN');
    expect(combo?.length).toBe(3);
  });

  it('rejects a pair chain shorter than 3 pairs', () => {
    expect(detectCombo([c('4', 'SPADE'), c('4', 'CLUB'), c('5', 'SPADE'), c('5', 'CLUB')])).toBeNull();
  });

  it('rejects a pair chain including rank 2', () => {
    const cards = [c('A', 'SPADE'), c('A', 'CLUB'), c('2', 'SPADE'), c('2', 'CLUB'), c('K', 'SPADE'), c('K', 'CLUB')];
    expect(detectCombo(cards)).toBeNull();
  });

  it('rejects non-consecutive pair ranks', () => {
    const cards = [c('4', 'SPADE'), c('4', 'CLUB'), c('5', 'SPADE'), c('5', 'CLUB'), c('7', 'SPADE'), c('7', 'CLUB')];
    expect(detectCombo(cards)).toBeNull();
  });
});

describe('enumerateCombos', () => {
  it('finds all pair combinations when a rank has more than 2 cards', () => {
    const hand = [c('9', 'SPADE'), c('9', 'CLUB'), c('9', 'DIAMOND')];
    const combos = enumerateCombos(hand);
    const pairs = combos.filter((combo) => combo.type === 'PAIR');
    expect(pairs.length).toBe(3); // C(3,2) = 3
  });

  it('finds a pair chain spanning a full hand', () => {
    const hand = [c('3', 'SPADE'), c('3', 'CLUB'), c('4', 'SPADE'), c('4', 'CLUB'), c('5', 'SPADE'), c('5', 'CLUB')];
    const combos = enumerateCombos(hand);
    expect(combos.some((combo) => combo.type === 'PAIR_CHAIN' && combo.length === 3)).toBe(true);
  });

  it('does not find any straight when the hand has fewer than 3 consecutive ranks', () => {
    const hand = [c('3', 'SPADE'), c('8', 'CLUB'), c('K', 'DIAMOND')];
    const combos = enumerateCombos(hand);
    expect(combos.some((combo) => combo.type === 'STRAIGHT')).toBe(false);
  });
});
