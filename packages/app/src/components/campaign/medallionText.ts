import { MEDALLIONS, type Held, type MedallionId } from '@big-two/campaign';

const NUMERALS = ['', 'I', 'II', 'III', 'IV'];

/** A Medallion's name with its level, as a relic is named: "Uprising II". Level 1 is the bare name. */
export function medallionName(id: MedallionId, level: number): string {
  const name = MEDALLIONS[id].name;
  return level > 1 ? `${name} ${NUMERALS[level] ?? level}` : name;
}

/** What a Medallion does at a level: that level's line, which says all of it. */
export function medallionEffect(id: MedallionId, level: number): string {
  const levels = MEDALLIONS[id].levels;
  return levels[Math.min(Math.max(1, level), levels.length) - 1] ?? '';
}

export const heldNames = (loadout: readonly Held[]): string =>
  loadout.map((m) => medallionName(m.id, m.level)).join(', ');
