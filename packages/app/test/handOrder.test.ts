import { describe, expect, it } from 'vitest';
import { cardId, type Card } from '@big-two/engine';
import { applyOrder, moveCard, moveCards, nextSortMode, sortCards, SORT_MODES } from '../src/lib/handOrder.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const labels = (cards: Card[]) => cards.map((x) => `${x.rank}${x.suit[0]}`).join(' ');

describe('sortCards', () => {
  const hand = [c('9', 'CLUB'), c('3', 'HEART'), c('9', 'SPADE'), c('K', 'DIAMOND'), c('3', 'SPADE')];

  it('rank mode groups same ranks together, weakest suit first', () => {
    expect(labels(sortCards(hand, 'rank'))).toBe('3S 3H 9S 9C KD');
  });

  it('groups mode puts playable combinations first and loose cards last', () => {
    const ordered = sortCards(hand, 'groups');
    // The two pairs are the structures here; the lone King trails them.
    expect(ordered).toHaveLength(5);
    expect(labels(ordered.slice(-1))).toBe('KD');
    expect(new Set(ordered.map(cardId)).size).toBe(5);
  });

  it('surfaces a straight as one contiguous run', () => {
    const straightHand = [
      c('K', 'SPADE'),
      c('5', 'CLUB'),
      c('4', 'DIAMOND'),
      c('7', 'HEART'),
      c('6', 'SPADE'),
      c('3', 'CLUB'),
    ];
    const ordered = sortCards(straightHand, 'groups');
    // 3-4-5-6-7 is a five-card straight; it should lead, with the King left over.
    expect(labels(ordered.slice(0, 5))).toBe('3C 4D 5C 6S 7H');
    expect(labels(ordered.slice(5))).toBe('KS');
  });

  it('never loses or duplicates a card, in any mode', () => {
    for (const mode of SORT_MODES) {
      const ordered = sortCards(hand, mode);
      expect(ordered.map(cardId).sort()).toEqual(hand.map(cardId).sort());
    }
  });
});

describe('nextSortMode', () => {
  it('cycles between the two arrangements and wraps', () => {
    // Sorting by suit was removed: it scattered pairs and straights across the
    // fan, which is the opposite of what a Big Two hand needs to show.
    expect(nextSortMode('rank')).toBe('groups');
    expect(nextSortMode('groups')).toBe('rank');
  });
});

describe('applyOrder', () => {
  const hand = [c('3', 'SPADE'), c('9', 'CLUB'), c('K', 'DIAMOND')];

  it('arranges the hand to match a stored order', () => {
    const order = [cardId(c('K', 'DIAMOND')), cardId(c('3', 'SPADE')), cardId(c('9', 'CLUB'))];
    expect(labels(applyOrder(hand, order))).toBe('KD 3S 9C');
  });

  it('ignores ids for cards that have already been played', () => {
    const order = [cardId(c('2', 'HEART')), cardId(c('9', 'CLUB')), cardId(c('3', 'SPADE'))];
    expect(labels(applyOrder(hand, order))).toBe('9C 3S KD');
  });

  it('appends cards the order has never seen, so a fresh deal still renders', () => {
    expect(applyOrder(hand, [])).toHaveLength(3);
    expect(labels(applyOrder(hand, []))).toBe('3S 9C KD');
  });
});

describe('moveCard', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('moves a card later in the order', () => {
    expect(moveCard(order, 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a card earlier in the order', () => {
    expect(moveCard(order, 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('clamps out-of-range targets instead of dropping the card', () => {
    expect(moveCard(order, 'a', -5)).toEqual(['a', 'b', 'c', 'd']);
    expect(moveCard(order, 'a', 99)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('leaves the order untouched for an unknown id', () => {
    expect(moveCard(order, 'zzz', 1)).toEqual(order);
  });
});

describe('moveCards — dragging a marked group', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];

  it('moves the whole group, keeping their relative order', () => {
    expect(moveCards(order, ['a', 'c'], 2)).toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('keeps relative order regardless of the order the ids are given in', () => {
    expect(moveCards(order, ['c', 'a'], 2)).toEqual(moveCards(order, ['a', 'c'], 2));
  });

  it('treats the target as an index into what is left behind', () => {
    // Pulling a and b out leaves [c, d, e]; index 0 puts them back at the front.
    expect(moveCards(order, ['a', 'b'], 0)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(moveCards(order, ['a', 'b'], 3)).toEqual(['c', 'd', 'e', 'a', 'b']);
  });

  it('clamps out-of-range targets instead of dropping cards', () => {
    expect(moveCards(order, ['b'], -9)).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(moveCards(order, ['b'], 99)).toEqual(['a', 'c', 'd', 'e', 'b']);
  });

  it('never loses or duplicates a card', () => {
    for (const target of [0, 1, 2, 3, 4, 5]) {
      const result = moveCards(order, ['b', 'd'], target);
      expect([...result].sort()).toEqual([...order].sort());
    }
  });

  it('leaves the order alone when no id is present', () => {
    expect(moveCards(order, ['zz'], 1)).toEqual(order);
  });

  it('agrees with moveCard for a single id', () => {
    expect(moveCards(order, ['a'], 2)).toEqual(moveCard(order, 'a', 2));
  });
});
