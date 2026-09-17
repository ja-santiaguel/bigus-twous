import { describe, expect, it } from 'vitest';
import { cardInColumn, classifyTouch, scrubSelection, nearestCentre, TOUCH_SLOP_PX } from '../src/lib/handGestures.js';

describe('classifyTouch', () => {
  it('treats a finger that hardly moved as a tap still in progress', () => {
    expect(classifyTouch(3, -4)).toBe('pending');
    expect(classifyTouch(TOUCH_SLOP_PX - 1, 0)).toBe('pending');
  });

  it('reads a push upward as lifting cards toward the table', () => {
    expect(classifyTouch(4, -30)).toBe('lift');
  });

  it('reads a slide along the hand as a sweep, even a slightly rising one', () => {
    expect(classifyTouch(30, 0)).toBe('scrub');
    expect(classifyTouch(-30, -12)).toBe('scrub');
    // Downward is never a lift.
    expect(classifyTouch(2, 40)).toBe('scrub');
  });
});

describe('cardInColumn', () => {
  const hand = [
    { id: 'a', left: 0 },
    { id: 'b', left: 25 },
    { id: 'c', left: 50 },
  ];

  it('finds the card whose visible strip is under the point, not the nearest centre', () => {
    // Just inside b's strip: b's centre is far to the right, a's is closer — but b is what shows here.
    expect(cardInColumn(28, hand)).toBe('b');
    expect(cardInColumn(10, hand)).toBe('a');
  });

  it('gives the top card everything to its right, and the first card anything left of the hand', () => {
    expect(cardInColumn(90, hand)).toBe('c');
    expect(cardInColumn(-20, hand)).toBe('a');
  });

  it('does not depend on the order it is handed the cards in', () => {
    expect(cardInColumn(55, [...hand].reverse())).toBe('c');
  });

  it('has nothing to find in an empty hand', () => {
    expect(cardInColumn(10, [])).toBeNull();
  });
});

describe('scrubSelection', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('picks every card slid over, keeping what was already picked', () => {
    expect(scrubSelection(order, new Set(['d']), new Set(['a', 'b']), true)).toEqual(['a', 'b', 'd']);
  });

  it('puts back every card slid over when the slide started on a picked card', () => {
    expect(scrubSelection(order, new Set(['a', 'b', 'c']), new Set(['b', 'c']), false)).toEqual(['a']);
  });

  it('returns the selection in hand order, however the slide went', () => {
    expect(scrubSelection(order, new Set(), new Set(['d', 'b']), true)).toEqual(['b', 'd']);
  });
});

describe('nearestCentre', () => {
  // Centres 20px apart: a at 10, b at 30, c at 50, d at 70. Boundaries at 20, 40, 60.
  const cards = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, centre: 10 + i * 20 }));

  it('picks the nearest centreline when nothing is hovered yet', () => {
    expect(nearestCentre(19, cards, null)).toBe('a');
    expect(nearestCentre(21, cards, null)).toBe('b');
  });

  it('gives every card the same zone either side of its centre', () => {
    // b's zone runs from 20 to 40: ten pixels each way from 30.
    expect(nearestCentre(20.5, cards, null)).toBe('b');
    expect(nearestCentre(39.5, cards, null)).toBe('b');
  });

  it('keeps the hovered card a few pixels past either boundary, and no further', () => {
    expect(nearestCentre(43, cards, 'b')).toBe('b');
    expect(nearestCentre(45, cards, 'b')).toBe('c');
    expect(nearestCentre(17, cards, 'b')).toBe('b');
    expect(nearestCentre(15, cards, 'b')).toBe('a');
  });

  it('gives less where cards are packed tightly', () => {
    const tight = ['a', 'b', 'c'].map((id, i) => ({ id, centre: i * 8 }));
    // A quarter of 8px is 2px past the boundary at 4.
    expect(nearestCentre(5.5, tight, 'a')).toBe('a');
    expect(nearestCentre(6.5, tight, 'a')).toBe('b');
  });

  it('lets go at once for a jump well past the padding', () => {
    expect(nearestCentre(68, cards, 'a')).toBe('d');
  });
});
