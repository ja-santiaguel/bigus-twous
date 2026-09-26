import { describe, expect, it } from 'vitest';
import { NUDGE_MS, NUDGE_RIPPLE_MS, specialPlays } from '../src/lib/specialPlays.js';

/**
 * How a hand shows its special plays: each named once over its left-most
 * card, the cards of one play moving as one, and plays of one card rippling
 * left to right.
 */
describe('special plays in the hand', () => {
  const hand = ['3C', '4D', '5H', '6S', '7C', '2S', '2H'];

  it('moves the cards of one play together, named over the left-most', () => {
    const ready = specialPlays(
      [{ cards: ['7C', '4D', '6S', '5H', '3C'], name: 'Uprising' }],
      'commoner',
      hand,
      new Map(),
      1000,
    );
    const delays = new Set(['3C', '4D', '5H', '6S', '7C'].map((id) => ready.get(id)!.delayMs));
    expect(delays.size).toBe(1);
    expect(ready.get('3C')!.tag).toBe('Uprising');
    expect(ready.get('4D')!.tag).toBeUndefined();
  });

  it('ripples plays of one card from the left, one beat apart', () => {
    const ready = specialPlays(
      [
        { cards: ['2H'], name: 'Decree' },
        { cards: ['2S'], name: 'Decree' },
      ],
      'tyrant',
      hand,
      new Map(),
      1000,
    );
    expect(ready.get('2H')!.delayMs - ready.get('2S')!.delayMs).toBe(NUDGE_RIPPLE_MS);
    // Named once, on the left-most.
    expect(ready.get('2S')!.tag).toBe('Decree');
    expect(ready.get('2H')!.tag).toBeUndefined();
  });

  it('counts every play a card is part of, and keeps it in time with its partners', () => {
    const ready = specialPlays(
      [
        { cards: ['2S'], name: 'Decree' },
        { cards: ['2S', '2H'], name: 'Iron Crown' },
      ],
      'tyrant',
      hand,
      new Map(),
      1000,
    );
    expect(ready.get('2S')!.plays).toEqual(['Decree', 'Iron Crown']);
    expect(ready.get('2S')!.delayMs).toBe(ready.get('2H')!.delayMs);
  });

  it('keeps each card on the shared clock, whenever it became ready', () => {
    const phases = new Map<string, number>();
    const first = specialPlays([{ cards: ['2S'], name: 'Decree' }], 'tyrant', hand, phases, 1000);
    const later = specialPlays(
      [{ cards: ['2S', '2H'], name: 'Iron Crown' }],
      'tyrant',
      hand,
      phases,
      1000 + NUDGE_MS * 3 + 700,
    );
    // Both beat on multiples of NUDGE_MS from the page's start.
    expect((1000 + first.get('2S')!.delayMs) % NUDGE_MS).toBe(0);
    expect((1000 + NUDGE_MS * 3 + 700 + later.get('2H')!.delayMs) % NUDGE_MS).toBe(0);
    // A card no longer ready is forgotten.
    specialPlays([], 'tyrant', hand, phases, 5000);
    expect(phases.size).toBe(0);
  });
});
