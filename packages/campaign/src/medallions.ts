import type { ClassId } from './classes.js';

/**
 * Medallions: the pieces a run builds its class with.
 *
 * Each belongs to one class and changes that class's rules — what it may beat,
 * how far its passive reaches, what its passive costs — never its gold. A
 * build is a way to beat the odds, not a way to get richer. Most go up in
 * level: the same Medallion again, stronger.
 *
 * The pools are shaped to the classes. The Commoner's are common and plentiful
 * and none of them turns a hand on its own; the Courtier's are a mix; the
 * Tyrant's are rare, and strong when they come.
 *
 * A few are no class's: rare, single-level, and about gold rather than cards
 * — a cheaper Requiem, a tithe from the table, a softer fall. Any run can
 * find them, and any computer can carry them.
 */

export type MedallionId =
  | 'uprising'
  | 'rabble'
  | 'frugal'
  | 'precedence'
  | 'royal-pair'
  | 'intrigue'
  | 'patronage'
  | 'decree'
  | 'blood-rite'
  | 'iron-crown'
  | 'unbowed'
  | 'ferrymans-coin'
  | 'tithe'
  | 'iron-stomach'
  | 'last-rites'
  | 'hoard';

export type Rarity = 'common' | 'rare' | 'legendary';

export interface MedallionDef {
  id: MedallionId;
  /** Null for the few any class can carry. */
  classId: ClassId | null;
  name: string;
  rarity: Rarity;
  /** What each level does, as a player reads it: the first line is level 1. */
  levels: string[];
}

export const MEDALLIONS: Record<MedallionId, MedallionDef> = {
  // The Commoner: plentiful, and never game-breaking on its own.
  uprising: {
    id: 'uprising',
    classId: 'commoner',
    name: 'Uprising',
    rarity: 'common',
    levels: ['Uprising needs only a straight of four.', 'A straight of six or more can also beat a pair of 2s.'],
  },
  rabble: {
    id: 'rabble',
    classId: 'commoner',
    name: 'Rabble',
    rarity: 'common',
    levels: ['A triple of 3 to 10 can beat a pair of Jacks to Aces.'],
  },
  frugal: {
    id: 'frugal',
    classId: 'commoner',
    name: 'Frugal',
    rarity: 'common',
    levels: ['Your class plays cost half.', 'Your class plays cost nothing.'],
  },
  // The Courtier: a mix, with a rare piece or two.
  precedence: {
    id: 'precedence',
    classId: 'courtier',
    name: 'Precedence',
    rarity: 'common',
    levels: [
      'A pair of Jacks or higher can also beat a triple of tens or lower.',
      'A pair of Jacks or higher can beat any lower triple, up to Queens.',
    ],
  },
  patronage: {
    id: 'patronage',
    classId: 'courtier',
    name: 'Patronage',
    rarity: 'common',
    levels: ['Your class plays cost half.', 'Your class plays cost nothing.'],
  },
  'royal-pair': {
    id: 'royal-pair',
    classId: 'courtier',
    name: 'Royal Pair',
    rarity: 'rare',
    levels: ['A pair of Aces can beat any triple below 2s.'],
  },
  intrigue: {
    id: 'intrigue',
    classId: 'courtier',
    name: 'Intrigue',
    rarity: 'rare',
    levels: ['A pair of Kings or Aces can beat a chain of three pairs.'],
  },
  // The Tyrant: rare, and strong when it comes.
  decree: {
    id: 'decree',
    classId: 'tyrant',
    name: 'Decree',
    rarity: 'rare',
    levels: ['Decree reaches straights of seven.', 'Decree reaches straights of any length.'],
  },
  'blood-rite': {
    id: 'blood-rite',
    classId: 'tyrant',
    name: 'Blood Rite',
    rarity: 'rare',
    levels: ['Your class plays cost one ante.', 'Your class plays cost half an ante.'],
  },
  'iron-crown': {
    id: 'iron-crown',
    classId: 'tyrant',
    name: 'Iron Crown',
    rarity: 'legendary',
    levels: ['A pair of 2s can beat any straight.'],
  },
  unbowed: {
    id: 'unbowed',
    classId: 'tyrant',
    name: 'Unbowed',
    rarity: 'legendary',
    levels: ['A single 2 you play cannot be chopped by four of a kind.'],
  },
  // Any class: rare, and about gold rather than cards.
  'ferrymans-coin': {
    id: 'ferrymans-coin',
    classId: null,
    name: "Ferryman's Coin",
    rarity: 'rare',
    levels: ['Where you would ante three times, you ante twice.'],
  },
  tithe: {
    id: 'tithe',
    classId: null,
    name: 'Tithe',
    rarity: 'rare',
    levels: ['Finish a hand first and every other player pays you one of their antes.'],
  },
  'iron-stomach': {
    id: 'iron-stomach',
    classId: null,
    name: 'Iron Stomach',
    rarity: 'rare',
    levels: ['The first time at each table you finish a hand last, half of what you put in comes back.'],
  },
  'last-rites': {
    id: 'last-rites',
    classId: null,
    name: 'Last Rites',
    rarity: 'rare',
    levels: ['Once a run, a hand that would leave you with nothing leaves you three antes.'],
  },
  hoard: {
    id: 'hoard',
    classId: null,
    name: 'Hoard',
    rarity: 'rare',
    levels: ['Buy-ins cost you one ante less.'],
  },
};

export const MEDALLION_IDS = Object.keys(MEDALLIONS) as MedallionId[];

/** A Medallion as held: which one, at what level. */
export interface Held {
  id: MedallionId;
  level: number;
}

export const maxLevel = (id: MedallionId): number => MEDALLIONS[id].levels.length;

/** The level a loadout holds a Medallion at, or 0. */
export function levelOf(loadout: readonly Held[], id: MedallionId): number {
  return loadout.find((m) => m.id === id)?.level ?? 0;
}

/** A loadout with a Medallion added, or raised a level if already held (to its cap). */
export function gain(loadout: readonly Held[], id: MedallionId): Held[] {
  const level = levelOf(loadout, id);
  if (level === 0) return [...loadout, { id, level: 1 }];
  return loadout.map((m) => (m.id === id ? { ...m, level: Math.min(maxLevel(id), m.level + 1) } : m));
}

/** Whether a loadout could take this Medallion: not held, or held below its cap. */
export const canGain = (loadout: readonly Held[], id: MedallionId): boolean => levelOf(loadout, id) < maxLevel(id);

/** How likely each rarity is to be drawn, by where it is drawn. */
export const RARITY_WEIGHTS: Record<'standard' | 'elite', Record<Rarity, number>> = {
  standard: { common: 10, rare: 3, legendary: 0.5 },
  elite: { common: 4, rare: 5, legendary: 2 },
};

/**
 * How often an any-class Medallion comes up, against a class's own of the same
 * rarity: there are five of them, and they should stay a find.
 */
export const NEUTRAL_WEIGHT = 0.4;

/** A shop's price, by rarity and by how deep the room is. A level up costs the same as a new one. */
export function medallionPrice(id: MedallionId, tier: number): number {
  const base = { common: 60, rare: 110, legendary: 180 }[MEDALLIONS[id].rarity];
  return Math.round(base * (1 + tier * 0.35));
}

/** Whether a class can carry a Medallion: its own, or one of any class's. */
export const fitsClass = (id: MedallionId, classId: ClassId): boolean =>
  MEDALLIONS[id].classId === null || MEDALLIONS[id].classId === classId;

export function isMedallionId(value: unknown): value is MedallionId {
  return typeof value === 'string' && value in MEDALLIONS;
}

/** A loadout read from storage, with anything this build does not know dropped. */
export function cleanLoadout(value: unknown): Held[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((m): Held[] => {
    const item = m as Partial<Held>;
    if (!isMedallionId(item?.id) || typeof item.level !== 'number') return [];
    return [{ id: item.id, level: Math.max(1, Math.min(maxLevel(item.id), Math.round(item.level))) }];
  });
}
