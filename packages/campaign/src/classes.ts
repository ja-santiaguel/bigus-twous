/**
 * The classes a campaign seat can hold, and the numbers that make each one's
 * risk philosophy real.
 *
 * Passive only, for now (DESIGN_SPEC 5): a class is one passive and a
 * temperament. The Seer is left out of the first playtest. Every number here
 * is a starting point for playtesting, not a balance claim.
 */

export type ClassId = 'commoner' | 'courtier' | 'tyrant';

export const CLASS_IDS: ClassId[] = ['commoner', 'courtier', 'tyrant'];

export interface ClassDef {
  id: ClassId;
  name: string;
  /**
   * Where the class's strength lies, as its preview says it: every class plays
   * every card, but each is at its best with some.
   */
  cards: string;
  /** The passive's name, said when it is used at the table. */
  passiveName: string;
  /** The passive, as a player reads it. */
  passive: string;
  /** Worth a run starts with. The table thresholds are scaled from this. */
  startingWorth: number;
  /** The table's ante, multiplied: how much a hand costs this class to sit. */
  anteMultiplier: number;
  /** Raise sizes on offer, in antes. */
  raiseSteps: number[];
  /** Raises a seat of this class may make in one hand. */
  raisesPerHand: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  commoner: {
    id: 'commoner',
    name: 'Wanderer',
    cards: 'the common cards, 3 to 10',
    passiveName: 'Uprising',
    passive: 'A straight of five or more can beat a single 2.',
    startingWorth: 360,
    anteMultiplier: 0.75,
    raiseSteps: [1],
    raisesPerHand: 2,
  },
  courtier: {
    id: 'courtier',
    name: 'Courtier',
    cards: 'the court, Jacks to Aces',
    passiveName: 'Allegiance',
    passive: 'A Jack, Queen, King or Ace can beat a higher single of its own suit — never a 2.',
    startingWorth: 440,
    anteMultiplier: 1,
    raiseSteps: [1, 2],
    raisesPerHand: 2,
  },
  tyrant: {
    id: 'tyrant',
    name: 'Tyrant',
    cards: "the 2s, the crown's own",
    passiveName: 'Decree',
    passive: 'A single 2 can beat a straight of three to five cards.',
    startingWorth: 420,
    anteMultiplier: 1.5,
    raiseSteps: [1, 2, 3],
    raisesPerHand: 3,
  },
};

export function isClassId(value: unknown): value is ClassId {
  return typeof value === 'string' && (CLASS_IDS as string[]).includes(value);
}
