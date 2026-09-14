import { describe, expect, it } from 'vitest';
import { detectCombo, type Card, type Combo, type GameEvent } from '@big-two/engine';
import { readMoment } from '../src/components/board/BombMoment.js';

/**
 * Which plays get the bomb moment.
 *
 * The moment is only worth anything if it is rare: a bomb landing on a 2, a
 * bomb answering a bomb, and four 2s. Everything else — including a bomb led
 * onto an empty table — is an ordinary play and must stay one.
 */

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const combo = (cards: Card[]): Combo => {
  const found = detectCombo(cards);
  if (!found) throw new Error('not a combo: ' + JSON.stringify(cards));
  return found;
};
const played = (playerId: string, cards: Card[]): GameEvent => ({
  type: 'CARDS_PLAYED',
  playerId,
  combo: combo(cards),
});
const label = (id: string) => (id === 'seat-2' ? 'Mia' : id);

const QUAD_SEVENS = [c('7', 'SPADE'), c('7', 'CLUB'), c('7', 'DIAMOND'), c('7', 'HEART')];

describe('the bomb moment', () => {
  it('calls a bomb on a 2 a chop, and says who did it', () => {
    const history = [played('seat-1', [c('2', 'HEART')]), played('seat-2', QUAD_SEVENS)];
    expect(readMoment(history, 1, 'seat-1', label)).toMatchObject({
      tone: 'chop',
      title: 'Chopped!',
      detail: 'Mia bombs a 2',
    });
  });

  it('speaks to you when the bomb is yours', () => {
    const history = [played('seat-2', [c('2', 'HEART')]), played('seat-1', QUAD_SEVENS)];
    expect(readMoment(history, 1, 'seat-1', label)?.detail).toBe('You bomb a 2');
  });

  it('calls a bomb on a bomb a counter-bomb', () => {
    const quadEights = [c('8', 'SPADE'), c('8', 'CLUB'), c('8', 'DIAMOND'), c('8', 'HEART')];
    const history = [played('seat-1', QUAD_SEVENS), played('seat-2', quadEights)];
    expect(readMoment(history, 1, 'seat-1', label)).toMatchObject({ tone: 'counter', title: 'Counter-bomb!' });
  });

  it('gives four 2s its own moment', () => {
    const twos = [c('2', 'SPADE'), c('2', 'CLUB'), c('2', 'DIAMOND'), c('2', 'HEART')];
    expect(readMoment([played('seat-2', twos)], 0, 'seat-1', label)).toMatchObject({
      tone: 'ceiling',
      title: 'Four 2s!',
    });
  });

  it('leaves a bomb led onto a clear table, and ordinary plays, alone', () => {
    const cleared: GameEvent[] = [
      played('seat-1', [c('2', 'HEART')]),
      { type: 'TRICK_RESET', leader: 'seat-2', wonBy: 'seat-1' },
      played('seat-2', QUAD_SEVENS),
    ];
    expect(readMoment(cleared, 2, 'seat-1', label)).toBeNull();
    expect(readMoment([played('seat-1', [c('9', 'CLUB')])], 0, 'seat-1', label)).toBeNull();
  });
});
