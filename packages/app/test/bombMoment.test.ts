import { describe, expect, it } from 'vitest';
import { detectCombo, type Card, type Combo, type GameEvent } from '@big-two/engine';
import { readMoment } from '../src/components/board/BombMoment.js';

/**
 * Which plays get a moment, and how big a one.
 *
 * Three levels, by how rare and how decisive the play is. Level 1 is a 2 laid
 * down or a short straight; level 2 a chop, a pair of 2s or a longer straight;
 * level 3 the plays that happen once in many games. Everything else —
 * including a bomb led onto an empty table — is an ordinary play and must stay
 * one. The callout names the kind of play and nothing else.
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

const QUAD_SEVENS = [c('7', 'SPADE'), c('7', 'CLUB'), c('7', 'DIAMOND'), c('7', 'HEART')];
const PAIR_OF_TWOS = [c('2', 'SPADE'), c('2', 'HEART')];
const FOUR_PAIR_CHAIN = [
  c('3', 'SPADE'),
  c('3', 'CLUB'),
  c('4', 'SPADE'),
  c('4', 'CLUB'),
  c('5', 'SPADE'),
  c('5', 'CLUB'),
  c('6', 'SPADE'),
  c('6', 'CLUB'),
];
const run = (length: number): Card[] => {
  const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
  return ranks.slice(0, length).map((rank, i) => c(rank, i % 2 ? 'CLUB' : 'SPADE'));
};

describe('big plays', () => {
  it('names the play and nothing else', () => {
    const cue = readMoment([played('seat-1', [c('2', 'HEART')]), played('seat-2', QUAD_SEVENS)], 1)!;
    expect(Object.keys(cue).sort()).toEqual(['key', 'level', 'title']);
    expect(cue.title).toBe('Chopped!');
  });

  it('gives a single 2 the first level', () => {
    expect(readMoment([played('seat-2', [c('2', 'SPADE')])], 0)).toMatchObject({ level: 1, title: 'Big Two!' });
  });

  it('raises a pair of 2s to the second, and three 2s to the third', () => {
    expect(readMoment([played('seat-2', PAIR_OF_TWOS)], 0)).toMatchObject({ level: 2, title: 'Pair of Twos!' });
    const three = [c('2', 'SPADE'), c('2', 'CLUB'), c('2', 'HEART')];
    expect(readMoment([played('seat-2', three)], 0)).toMatchObject({ level: 3, title: 'Three Twos!' });
  });

  it('makes a chop of a single 2 level two, and of a pair of 2s level three', () => {
    const chopOne = [played('seat-1', [c('2', 'HEART')]), played('seat-2', QUAD_SEVENS)];
    expect(readMoment(chopOne, 1)).toMatchObject({ level: 2, title: 'Chopped!' });
    const chopPair = [played('seat-1', PAIR_OF_TWOS), played('seat-2', FOUR_PAIR_CHAIN)];
    expect(readMoment(chopPair, 1)).toMatchObject({ level: 3, title: 'Double chop!' });
  });

  it('makes a bomb on a bomb level three', () => {
    const quadEights = [c('8', 'SPADE'), c('8', 'CLUB'), c('8', 'DIAMOND'), c('8', 'HEART')];
    const history = [played('seat-1', QUAD_SEVENS), played('seat-2', quadEights)];
    expect(readMoment(history, 1)).toMatchObject({ level: 3, title: 'Counter-bomb!' });
  });

  it('makes four 2s level three', () => {
    const twos = [c('2', 'SPADE'), c('2', 'CLUB'), c('2', 'DIAMOND'), c('2', 'HEART')];
    expect(readMoment([played('seat-2', twos)], 0)).toMatchObject({ level: 3, title: 'Four Twos!' });
  });

  it('grades a straight by how often a hand holds one: four or five, six or seven, eight or more', () => {
    expect(readMoment([played('seat-2', run(4))], 0)).toMatchObject({ level: 1, title: 'Straight of 4!' });
    expect(readMoment([played('seat-2', run(5))], 0)?.level).toBe(1);
    expect(readMoment([played('seat-2', run(6))], 0)).toMatchObject({ level: 2, title: 'Straight of 6!' });
    expect(readMoment([played('seat-2', run(7))], 0)?.level).toBe(2);
    expect(readMoment([played('seat-2', run(8))], 0)).toMatchObject({ level: 3, title: 'Straight of 8!' });
    expect(readMoment([played('seat-2', run(12))], 0)).toMatchObject({ level: 3, title: 'Dragon!' });
  });

  it('spells twos out, so no "2" ever sits beside an "S" in the pixel face', () => {
    const titles = [
      readMoment([played('seat-2', [c('2', 'SPADE')])], 0)!.title,
      readMoment([played('seat-2', PAIR_OF_TWOS)], 0)!.title,
      readMoment([played('seat-2', [c('2', 'SPADE'), c('2', 'CLUB'), c('2', 'HEART')])], 0)!.title,
      readMoment([played('seat-2', [c('2', 'SPADE'), c('2', 'CLUB'), c('2', 'DIAMOND'), c('2', 'HEART')])], 0)!.title,
    ];
    for (const title of titles) expect(title).not.toMatch(/\d/);
  });

  it('leaves a straight of three alone: nearly every hand holds one', () => {
    expect(readMoment([played('seat-2', run(3))], 0)).toBeNull();
  });

  it('leaves a bomb led onto a clear table, and ordinary plays, alone', () => {
    const cleared: GameEvent[] = [
      played('seat-1', [c('2', 'HEART')]),
      { type: 'TRICK_RESET', leader: 'seat-2', wonBy: 'seat-1' },
      played('seat-2', QUAD_SEVENS),
    ];
    expect(readMoment(cleared, 2)).toBeNull();
    expect(readMoment([played('seat-1', [c('9', 'CLUB')])], 0)).toBeNull();
    expect(readMoment([played('seat-1', [c('K', 'CLUB'), c('K', 'SPADE')])], 0)).toBeNull();
  });
});
