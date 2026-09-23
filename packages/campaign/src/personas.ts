import type { Difficulty } from '@big-two/ai';
import type { Rng } from '@big-two/engine';
import { CLASS_IDS, CLASSES, type ClassId } from './classes.js';
import type { Held } from './medallions.js';

/**
 * The computers at a campaign table: who they are, what class they hold, and
 * how they wager.
 *
 * A temperament is how a computer bets, not how it plays its cards — card play
 * comes from the tier's difficulty. Three is enough to read at a glance:
 *   cautious  stakes low, rarely raises
 *   steady    stakes mid-range, raises a good hand
 *   reckless  stakes high, raises often and large
 */

export type Temperament = 'cautious' | 'steady' | 'reckless';

export const TEMPERAMENTS: Temperament[] = ['cautious', 'steady', 'reckless'];

export interface Persona {
  /** Unique within a run. */
  key: string;
  name: string;
  classId: ClassId;
  temperament: Temperament;
  difficulty: Difficulty;
  /** Worth when it sits down. */
  worth: number;
  medallions: Held[];
  /** Set for a Vestige: which past run it is. */
  vestigeOf?: string;
}

/**
 * Ten letters at most: on a phone three seats share one row, and a name has
 * about that much room above its fan.
 */
export const CPU_NAMES = [
  'Old Wick',
  'Vane',
  'Marrow',
  'Widow Hale',
  'Crane',
  'Ashby',
  'Morrow',
  'Pike',
  'Coal',
  'Tallow',
  'Ferren',
  'Hollis',
  'Quill',
  'Sorrel',
  'Black Tom',
  'Canon Rook',
  'Ada Flint',
  'The Tanner',
  'Lord Aske',
  'Nell',
  'Crowe',
  'Wren',
  'Dray',
  'Mercy Ould',
];

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

export function between(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/**
 * A new computer for a table. `used` holds names already at the table or in
 * its queue, so one table never seats two of the same person.
 */
export function makePersona(
  rng: Rng,
  key: string,
  options: {
    difficulty: Difficulty;
    /** Worth, as a multiple of the class's starting Worth. */
    worthFactor: [number, number];
    classId?: ClassId;
    temperament?: Temperament;
    used?: Set<string>;
  },
): Persona {
  const classId = options.classId ?? pick(rng, CLASS_IDS);
  const free = CPU_NAMES.filter((n) => !options.used?.has(n));
  const name = pick(rng, free.length > 0 ? free : CPU_NAMES);
  options.used?.add(name);
  const [lo, hi] = options.worthFactor;
  return {
    key,
    name,
    classId,
    temperament: options.temperament ?? pick(rng, TEMPERAMENTS),
    difficulty: options.difficulty,
    worth: Math.round(CLASSES[classId].startingWorth * between(rng, lo, hi)),
    medallions: [],
  };
}
