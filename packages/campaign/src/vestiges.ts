import { CLASSES, type ClassId } from './classes.js';
import type { Held } from './medallions.js';
import type { Persona, Temperament } from './personas.js';
import { keyOf, PLAYER_KEY, type TableState } from './table.js';

/**
 * Vestiges: your past victories, kept to sit against you at the end of every
 * later run (DESIGN_SPEC 7).
 *
 * A Vestige keeps a run's identity — its class, its Medallions, how it bet —
 * and loses its fortune: it sits down at the finale with a normalised Worth,
 * so it is recognisable, not unbeatable. Three at most. When a run wins the
 * finale, the Vestige that went broke first there makes way for this run's
 * Phantom; if none went broke, the poorest one does.
 */

export interface VestigeRecord {
  key: string;
  name: string;
  classId: ClassId;
  medallions: Held[];
  temperament: Temperament;
  /** When the run was won, ISO date. */
  wonAt: string;
}

export const VESTIGE_SLOTS = 3;

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** How a run bet, read from how often it raised. */
export function temperamentOf(raises: number, hands: number): Temperament {
  const rate = hands > 0 ? raises / hands : 0;
  return rate >= 0.5 ? 'reckless' : rate >= 0.2 ? 'steady' : 'cautious';
}

/** A finished run, as it will sit at future finales. */
export function phantomOf(
  run: { seed: string; name?: string; classId: ClassId; medallions: Held[]; raises: number; handsPlayed: number },
  victories: number,
  wonAt: string,
): VestigeRecord {
  return {
    key: `vestige:${run.seed}`,
    // The run's own name, so you know it again at the throne; a run from
    // before runs were named is called by its class and a numeral.
    name: run.name ?? `${CLASSES[run.classId].name} ${NUMERALS[victories % NUMERALS.length] ?? victories + 1}`,
    classId: run.classId,
    medallions: run.medallions,
    temperament: temperamentOf(run.raises, run.handsPlayed),
    wonAt,
  };
}

/** A Vestige as a seat at the finale: its identity, and a normalised Worth. */
export function vestigePersona(record: VestigeRecord, worthFactor: number): Persona {
  return {
    key: record.key,
    name: record.name,
    classId: record.classId,
    temperament: record.temperament,
    difficulty: 'hard',
    worth: Math.round(CLASSES[record.classId].startingWorth * worthFactor),
    medallions: record.medallions,
    vestigeOf: record.key,
  };
}

/** The Vestiges after a won finale: this run's Phantom in, the first to fall there out. */
export function recordVictory(vestiges: VestigeRecord[], finale: TableState, phantom: VestigeRecord): VestigeRecord[] {
  if (vestiges.length < VESTIGE_SLOTS) return [...vestiges, phantom];
  const keys = new Set(vestiges.map((v) => v.key));
  const firstGone = finale.departed.find((key) => key !== PLAYER_KEY && keys.has(key));
  const poorest = [...finale.seats]
    .filter((s) => s.persona?.vestigeOf && keys.has(keyOf(s)))
    .sort((a, b) => a.worth - b.worth)[0];
  const out = firstGone ?? (poorest ? keyOf(poorest) : vestiges[0]!.key);
  return vestiges.map((v) => (v.key === out ? phantom : v));
}
