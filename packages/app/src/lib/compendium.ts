import { MEDALLIONS, type MedallionId, type RunState, type VestigeRecord } from '@big-two/campaign';

/**
 * The compendium's memory: every Medallion you have come across, in any run,
 * and the highest level you have seen it at.
 *
 * A Medallion is discovered once the game has shown it to you — carried, on
 * the Bone Merchant's table, among a won table's spoils, in a Reliquary's
 * coffers once they are opened, or carried by a player at a table on offer —
 * at the level it was shown. Seeing a level reveals the ones below it; the
 * ones above stay sealed until they are seen. Kept apart from the run, so it
 * outlasts every run.
 */

const KEY = 'bigtwo:compendium';

/** Each Medallion found, by the highest level seen. */
export type Discovered = Partial<Record<MedallionId, number>>;

/** Every Medallion a run is showing you now, at the highest level it shows each. */
export function seenIn(run: RunState | null, vestiges: readonly VestigeRecord[] = []): Discovered {
  const seen: Discovered = {};
  const see = (id: MedallionId, level: number) => {
    if (!(id in MEDALLIONS)) return;
    seen[id] = Math.max(seen[id] ?? 0, level);
  };
  for (const v of vestiges) for (const m of v.medallions) see(m.id, m.level);
  if (!run) return seen;
  for (const m of run.medallions) see(m.id, m.level);
  if (run.phase === 'shop') {
    for (const id of run.shopOffers) see(id, (run.medallions.find((m) => m.id === id)?.level ?? 0) + 1);
  }
  if (run.phase === 'reward') for (const offer of run.rewards) see(offer.id, offer.level);
  const event = run.event;
  if (event?.id === 'reliquary' && event.opened !== null) {
    for (const coffer of event.coffers) if (coffer.holds.kind === 'medallion') see(coffer.holds.id, 1);
  }
  // Players at the tables you may choose, and at the one you sit at.
  for (const offer of Object.values(run.offers))
    for (const p of offer.lineup) for (const m of p.medallions) see(m.id, m.level);
  for (const seat of run.table?.seats ?? []) for (const m of seat.medallions) see(m.id, m.level);
  return seen;
}

/** The two put together, each Medallion at the higher level; null if nothing new was found. */
export function merged(known: Discovered, fresh: Discovered): Discovered | null {
  let changed = false;
  const out: Discovered = { ...known };
  for (const [id, level] of Object.entries(fresh) as [MedallionId, number][]) {
    const max = Math.min(level, MEDALLIONS[id].levels.length);
    if (max > (out[id] ?? 0)) {
      out[id] = max;
      changed = true;
    }
  }
  return changed ? out : null;
}

/** Every level of every Medallion, each its own entry in the compendium. */
export function levelCount(): number {
  return Object.values(MEDALLIONS).reduce((sum, m) => sum + m.levels.length, 0);
}

/** How many of those levels have been found. */
export function foundCount(discovered: Discovered): number {
  return (Object.entries(discovered) as [MedallionId, number][]).reduce(
    (sum, [id, level]) => sum + (id in MEDALLIONS ? Math.min(level, MEDALLIONS[id].levels.length) : 0),
    0,
  );
}

export function readDiscovered(): Discovered {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value = raw ? (JSON.parse(raw) as { version?: number; seen?: unknown }) : null;
    if (value?.version === 2 && value.seen && typeof value.seen === 'object') return value.seen as Discovered;
    // The first compendium kept only which Medallions were found: each at its first level.
    if (value?.version === 1 && Array.isArray(value.seen)) {
      return Object.fromEntries((value.seen as MedallionId[]).map((id) => [id, 1])) as Discovered;
    }
    return {};
  } catch {
    return {};
  }
}

export function writeDiscovered(discovered: Discovered): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ version: 2, seen: discovered }));
  } catch {
    /* storage full or disabled: the compendium lasts as long as the page */
  }
}
