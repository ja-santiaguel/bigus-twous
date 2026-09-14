import { describe, expect, it } from 'vitest';
import { createDeck, dealHands, findThreeOfSpadesHolder } from '../src/cards.js';
import { createRng } from '../src/rng.js';
import { cardValue } from '../src/types.js';

describe('deck', () => {
  it('has 52 unique cards', () => {
    const deck = createDeck();
    expect(deck.length).toBe(52);
    const ids = new Set(deck.map((c) => `${c.rank}_${c.suit}`));
    expect(ids.size).toBe(52);
  });
});

describe('card ranking', () => {
  it('ranks 3 of spades as the lowest card in the deck', () => {
    const deck = createDeck();
    const lowest = deck.reduce((min, c) => (cardValue(c) < cardValue(min) ? c : min));
    expect(lowest).toEqual({ rank: '3', suit: 'SPADE' });
  });

  it('ranks 2 of hearts as the highest card in the deck', () => {
    const deck = createDeck();
    const highest = deck.reduce((max, c) => (cardValue(c) > cardValue(max) ? c : max));
    expect(highest).toEqual({ rank: '2', suit: 'HEART' });
  });

  it('orders suits Spade < Club < Diamond < Heart for same rank', () => {
    expect(cardValue({ rank: '5', suit: 'SPADE' })).toBeLessThan(cardValue({ rank: '5', suit: 'CLUB' }));
    expect(cardValue({ rank: '5', suit: 'CLUB' })).toBeLessThan(cardValue({ rank: '5', suit: 'DIAMOND' }));
    expect(cardValue({ rank: '5', suit: 'DIAMOND' })).toBeLessThan(cardValue({ rank: '5', suit: 'HEART' }));
  });
});

describe('dealHands', () => {
  it('deals 13 cards to each of 4 players deterministically for a given seed', () => {
    const ids = ['p1', 'p2', 'p3', 'p4'];
    const handsA = dealHands(ids, createRng('seed-123'));
    const handsB = dealHands(ids, createRng('seed-123'));
    for (const id of ids) {
      expect(handsA.get(id)!.length).toBe(13);
      expect(handsA.get(id)).toEqual(handsB.get(id)); // same seed -> same deal
    }
  });

  it('produces different deals for different seeds', () => {
    const ids = ['p1', 'p2', 'p3', 'p4'];
    const handsA = dealHands(ids, createRng('seed-A'));
    const handsB = dealHands(ids, createRng('seed-B'));
    expect(handsA.get('p1')).not.toEqual(handsB.get('p1'));
  });

  it('always deals the 3 of Spades to exactly one player', () => {
    const ids = ['p1', 'p2', 'p3', 'p4'];
    const hands = dealHands(ids, createRng('seed-xyz'));
    const holder = findThreeOfSpadesHolder(hands);
    expect(ids).toContain(holder);
  });
});
