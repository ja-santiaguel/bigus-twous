import type { Difficulty } from '@big-two/ai';

/**
 * The rooms of the descent, and the kinds of table found in them.
 *
 * Tables differ by who is seated and what is at stake, never by rules
 * (BRAINSTORM 7): an archetype only changes the lineup, the ante, the stake
 * floor and what winning pays. Every number is a first guess for playtesting.
 */

/*
 * A hand is the unit of damage. Finishing last in an ordinary hand costs you
 * one ante — about a tenth of a starting purse in the first room — and a
 * Requiem three; finishing first gains a little more than one. So no single
 * hand ends a run, a bad table hurts, and a string of lost hands does kill:
 * gold is the run's health. The antes are set for that, and the buy-ins and
 * class-play prices are set in gold, the same whatever the ante.
 */

/** The world a run descends through. The rooms' own names wait for acts. */
export const WORLD_NAME = 'The Hollow Deep';

export interface TierDef {
  index: number;
  name: string;
  /** The table's ante, before a class's multiplier. */
  ante: number;
  /**
   * The Mark (the table's target), as a gain in your own antes over your Worth
   * when you sat down. Counted from where you start, so every table asks for
   * a comparable climb and arriving rich does not arrive past it. A first
   * place nets about 1.2 antes, a second about 0.3: the target is two or three
   * good hands in the first room, more further down.
   */
  markAntes: number;
  /**
   * How many hands the table lasts; the last is always the Requiem. Short at
   * the top of the descent, where a table is a quick lesson, and longer in the
   * depths, where a table is a siege.
   */
  hands: number;
  /** Hands you must play before you may call a Reckoning. */
  showdownWait: number;
  /** How well the computers play the cards. */
  difficulty: Difficulty;
  /** A computer's Worth when it sits down, as a multiple of its class's starting Worth. */
  cpuWorth: [number, number];
  /**
   * The computers' own Medallions: the chance each one holds any, how many at
   * most, and how high their levels go. None in the first room; the depths
   * are where the other players have built themselves too.
   */
  cpuMedallions: { chance: number; count: number; maxLevel: number };
}

export const TIERS: TierDef[] = [
  // Medium, not easy, even here: the base game's easy computer always plays its
  // smallest combo, so it only ever leads singles — fine as a first opponent
  // in a practice game, but not a table worth reading. The Lychgate is easier
  // by its stakes, its length and its players' gold, not by playing badly.
  {
    index: 0,
    name: 'The Lychgate',
    ante: 40,
    markAntes: 2,
    hands: 5,
    showdownWait: 2,
    difficulty: 'medium',
    cpuWorth: [0.7, 1.1],
    cpuMedallions: { chance: 0, count: 0, maxLevel: 0 },
  },
  {
    index: 1,
    name: 'The Ossuary',
    ante: 70,
    markAntes: 2,
    hands: 6,
    showdownWait: 2,
    difficulty: 'medium',
    cpuWorth: [0.9, 1.3],
    cpuMedallions: { chance: 0.3, count: 1, maxLevel: 1 },
  },
  {
    index: 2,
    name: 'The Drowned Chapel',
    ante: 120,
    markAntes: 3,
    hands: 7,
    showdownWait: 2,
    difficulty: 'hard',
    cpuWorth: [1.1, 1.6],
    cpuMedallions: { chance: 0.5, count: 1, maxLevel: 1 },
  },
  {
    index: 3,
    name: 'The Sunken Crypt',
    ante: 200,
    markAntes: 3,
    hands: 9,
    showdownWait: 3,
    difficulty: 'hard',
    cpuWorth: [1.3, 2],
    cpuMedallions: { chance: 0.75, count: 2, maxLevel: 2 },
  },
  {
    index: 4,
    name: 'The Hollow Throne',
    ante: 320,
    markAntes: 4,
    hands: 11,
    showdownWait: 3,
    difficulty: 'hard',
    cpuWorth: [1.6, 2.2],
    cpuMedallions: { chance: 1, count: 2, maxLevel: 2 },
  },
];

/** The last tier is the finale. */
export const FINALE_TIER = TIERS.length - 1;

/** A Requiem's ante, in antes — and the others' at a Reckoning. */
export const SHOWDOWN_ANTE = 3;

export type Archetype = 'modest' | 'high-stakes' | 'desperation' | 'predator' | 'mirror' | 'vestige';

export interface ArchetypeDef {
  id: Archetype;
  name: string;
  /** What a player reads before choosing it. */
  blurb: string;
  anteMultiplier: number;
  /**
   * The buy-in, in the tier's antes: the same for everyone at the table, and
   * set by what the table risks and pays. It is what a seat costs, not a bet
   * sized to a purse, so a table's price is known before it is chosen.
   */
  buyInAntes: number;
  /** The Mark, multiplied. */
  markMultiplier: number;
  /**
   * What winning it pays, besides the buy-ins: a choice of Medallions. An
   * elite table's choice leans rare and can raise one you hold a level.
   */
  reward: 'none' | 'standard' | 'elite';
  /** Harder than its room: richer players, and more of them carry Medallions. */
  elite: boolean;
}

export const ARCHETYPES: Record<Archetype, ArchetypeDef> = {
  modest: {
    id: 'modest',
    name: "Paupers' Table",
    blurb: 'Everyone as poor as you, and a cheap seat.',
    anteMultiplier: 1,
    buyInAntes: 2,
    markMultiplier: 0.95,
    reward: 'standard',
    elite: false,
  },
  'high-stakes': {
    id: 'high-stakes',
    name: 'Gilded Table',
    blurb: 'Rich players, a heavy ante and a steep buy-in.',
    anteMultiplier: 1.5,
    buyInAntes: 4.5,
    markMultiplier: 1.1,
    reward: 'elite',
    elite: true,
  },
  desperation: {
    id: 'desperation',
    name: 'Starving Table',
    blurb: 'Players a hand from the grave, and reckless with it.',
    anteMultiplier: 1,
    buyInAntes: 2.5,
    markMultiplier: 1,
    reward: 'standard',
    elite: false,
  },
  predator: {
    id: 'predator',
    name: 'Carrion Table',
    blurb: 'One player far richer than the rest, feeding on the weak.',
    anteMultiplier: 1.2,
    buyInAntes: 3.5,
    markMultiplier: 1.05,
    reward: 'elite',
    elite: true,
  },
  mirror: {
    id: 'mirror',
    name: 'Mirror Table',
    blurb: 'Every player shares your class.',
    anteMultiplier: 1,
    buyInAntes: 2.5,
    markMultiplier: 1,
    reward: 'standard',
    elite: false,
  },
  vestige: {
    id: 'vestige',
    name: 'The Hollow Throne',
    blurb: 'Your own past victories, waiting on the throne.',
    anteMultiplier: 1,
    buyInAntes: 3,
    markMultiplier: 1,
    reward: 'none',
    elite: false,
  },
};

/** The archetypes a tier's choices are drawn from. */
export const TIER_ARCHETYPES: Archetype[] = ['modest', 'high-stakes', 'desperation', 'predator', 'mirror'];
