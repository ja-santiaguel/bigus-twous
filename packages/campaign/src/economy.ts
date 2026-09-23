import type { PlayerId } from '@big-two/engine';

/**
 * Pots: who put in what, and who takes what back.
 *
 * One settlement serves every pot in the campaign — a hand's ante-and-raise
 * pot and a table's stake pot — and it is the whole of three rules at once:
 *
 *   - **Split by placement** (DESIGN_SPEC 2, 4). The hand pot and the table
 *     prize both pay 70/25/5/0.
 *   - **All-in is capped** (DESIGN_SPEC 3). A seat can win at most what it
 *     put in, from each other seat.
 *   - **A raise after someone is out** is matched only by the seats still
 *     playing, so it is theirs alone to share.
 *
 * All three fall out of the same construction, poker's side pots: the pot is
 * cut into layers at each distinct contribution, and each layer is shared only
 * among the seats that paid all of it, by their order among themselves, with
 * the curve cut down to that many seats and renormalised (3 → 70:25:5 of 100;
 * 2 → 70:25 of 95, 74/26). Gold is whole coins: a layer's remainder goes to the
 * best-placed seat sharing it.
 */

/**
 * One payout for every pot: 70% to first, 25% to second, 5% to third, nothing
 * to last. The hand pot and the table prize share it, so there is one ratio
 * to learn, and finishing last always costs you everything you put in.
 */
export const PAYOUT = [70, 25, 5, 0];
/** The hand pot's curve. */
export const HAND_WEIGHTS = PAYOUT;
/** The table prize's curve. */
export const STAKE_WEIGHTS = PAYOUT;

/**
 * What each seat takes back from a pot.
 *
 * @param contributions what each seat put in
 * @param placing every seat, best first (a hand's finishing order, the last
 *   seat still holding cards at the end)
 * @param weights the curve, best first
 */
export function settlePot(
  contributions: Record<PlayerId, number>,
  placing: PlayerId[],
  weights: number[],
): Record<PlayerId, number> {
  const payout: Record<PlayerId, number> = {};
  for (const id of Object.keys(contributions)) payout[id] = 0;
  const rank = new Map(placing.map((id, i) => [id, i] as const));
  const levels = [...new Set(Object.values(contributions).filter((c) => c > 0))].sort((a, b) => a - b);

  let floor = 0;
  for (const level of levels) {
    let layer = 0;
    for (const paid of Object.values(contributions)) layer += Math.max(0, Math.min(paid, level) - floor);
    // The seats that paid this whole layer, best placed first.
    const sharing = Object.keys(contributions)
      .filter((id) => (contributions[id] ?? 0) >= level)
      .sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
    // Seats past the curve's end — a player who busted and left — share nothing.
    const curve = sharing.map((_, i) => weights[i] ?? 0);
    const total = curve.reduce((sum, w) => sum + w, 0);
    let given = 0;
    sharing.forEach((id, i) => {
      const share = total > 0 ? Math.floor((layer * curve[i]!) / total) : 0;
      payout[id] = (payout[id] ?? 0) + share;
      given += share;
    });
    if (sharing[0] !== undefined) payout[sharing[0]] = (payout[sharing[0]] ?? 0) + (layer - given);
    floor = level;
  }
  return payout;
}

/** A hand's pot while it is being played. */
export interface HandPot {
  /** What each seat has put in so far: ante, raises and matched raises. */
  contributions: Record<PlayerId, number>;
  /** Seats with nothing left to put in. */
  allIn: PlayerId[];
  /** Raises made this hand, by seat. */
  raises: Record<PlayerId, number>;
}

/**
 * Take the ante from every seat. A seat that cannot cover it puts in what it
 * has and is all-in.
 */
export function openPot(worth: Record<PlayerId, number>, antes: Record<PlayerId, number>): HandPot {
  const contributions: Record<PlayerId, number> = {};
  const allIn: PlayerId[] = [];
  for (const [id, have] of Object.entries(worth)) {
    const ante = antes[id] ?? 0;
    contributions[id] = Math.min(have, ante);
    if (have <= ante) allIn.push(id);
  }
  return { contributions, allIn, raises: {} };
}

/**
 * A raise, matched (DESIGN_SPEC 2). The raiser puts in `amount`; every other
 * seat still holding cards puts in the same, as far as its Worth covers — and
 * anyone it empties is all-in. Seats already out of the hand do not match.
 */
export function raise(
  pot: HandPot,
  worth: Record<PlayerId, number>,
  raiser: PlayerId,
  amount: number,
  stillPlaying: PlayerId[],
): HandPot {
  const contributions = { ...pot.contributions };
  const allIn = [...pot.allIn];
  const payIn = (id: PlayerId) => {
    const left = (worth[id] ?? 0) - (contributions[id] ?? 0);
    const paid = Math.max(0, Math.min(left, amount));
    contributions[id] = (contributions[id] ?? 0) + paid;
    if (paid >= left && !allIn.includes(id)) allIn.push(id);
  };
  payIn(raiser);
  for (const id of stillPlaying) if (id !== raiser && !allIn.includes(id)) payIn(id);
  return { contributions, allIn, raises: { ...pot.raises, [raiser]: (pot.raises[raiser] ?? 0) + 1 } };
}

/** What each seat can still put in this hand. */
export function available(pot: HandPot, worth: Record<PlayerId, number>, id: PlayerId): number {
  return Math.max(0, (worth[id] ?? 0) - (pot.contributions[id] ?? 0));
}

/**
 * Worth after a pot is settled: what each seat had, less what it put in, plus
 * what it took back.
 */
export function applySettlement(
  worth: Record<PlayerId, number>,
  contributions: Record<PlayerId, number>,
  payout: Record<PlayerId, number>,
): Record<PlayerId, number> {
  const next: Record<PlayerId, number> = {};
  for (const [id, have] of Object.entries(worth)) {
    next[id] = have - (contributions[id] ?? 0) + (payout[id] ?? 0);
  }
  return next;
}
