import type { MedallionId, RunState, VestigeRecord } from '@big-two/campaign';

/**
 * The compendium's memory: every Medallion you have come across, in any run.
 *
 * A Medallion is discovered once the game has shown it to you — carried, on
 * the Bone Merchant's table, among a won table's spoils, in a Reliquary's
 * coffers once they are opened, or carried by a player at a table on offer.
 * Kept apart from the run, so it outlasts every run.
 */

const KEY = 'bigtwo:compendium';

/** Every Medallion a run is showing you now. */
export function seenIn(run: RunState | null, vestiges: readonly VestigeRecord[] = []): MedallionId[] {
  const seen = new Set<MedallionId>();
  for (const v of vestiges) for (const m of v.medallions) seen.add(m.id);
  if (!run) return [...seen];
  for (const m of run.medallions) seen.add(m.id);
  if (run.phase === 'shop') for (const id of run.shopOffers) seen.add(id);
  if (run.phase === 'reward') for (const offer of run.rewards) seen.add(offer.id);
  const event = run.event;
  if (event?.id === 'reliquary' && event.opened !== null) {
    for (const coffer of event.coffers) if (coffer.holds.kind === 'medallion') seen.add(coffer.holds.id);
  }
  // Players at the tables you may choose, and at the one you sit at.
  for (const offer of Object.values(run.offers))
    for (const p of offer.lineup) for (const m of p.medallions) seen.add(m.id);
  for (const seat of run.table?.seats ?? []) for (const m of seat.medallions) seen.add(m.id);
  return [...seen];
}

export function readDiscovered(): MedallionId[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value = raw ? (JSON.parse(raw) as { version?: number; seen?: unknown }) : null;
    return value?.version === 1 && Array.isArray(value.seen) ? (value.seen as MedallionId[]) : [];
  } catch {
    return [];
  }
}

export function writeDiscovered(ids: readonly MedallionId[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 1, seen: ids }));
  } catch {
    /* storage full or disabled: the compendium lasts as long as the page */
  }
}
