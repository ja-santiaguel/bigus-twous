import type { Card, PlayerId } from './types.js';

/**
 * Match scoring (9.15).
 *
 * A round is scored by *placement*, which is why the round now runs until only
 * one player still holds cards rather than stopping the moment someone goes
 * out. Finishing first is worth materially more than finishing second, and the
 * player left holding the bag scores nothing.
 *
 * Kept in its own module, and pure, so the scoring rule can be changed or made
 * configurable per table without touching the state machine.
 */

/** Points by finishing place: first out, second, third, last. */
export const PLACEMENT_POINTS: readonly number[] = [5, 3, 1, 0];

export function placementPoints(place: number): number {
  return PLACEMENT_POINTS[place] ?? 0;
}

/**
 * Points deducted per Two still in hand when the round ends.
 *
 * Defined but **not applied** — `scoreRound` defaults `twoPenalty` to 0, so
 * placement alone decides the score today. It lives here because the rule is
 * one the table may want later (holding Twos to the end is the classic way to
 * lose a round badly), and a pure function nobody calls is cheaper to keep
 * than a rule that has to be re-derived from scratch.
 */
export const DEFAULT_TWO_PENALTY = 0;

export function twosHeld(hand: Card[]): number {
  return hand.filter((card) => card.rank === '2').length;
}

export interface RoundScoreOptions {
  /** Points deducted per Two held at round end. 0 (the default) disables the penalty. */
  twoPenalty?: number;
}

/**
 * Scores one round. Players absent from `finishOrder` never went out and all
 * share last place — with four players exactly one does, since the round ends
 * as soon as three have finished.
 */
export function scoreRound(
  finishOrder: PlayerId[],
  players: readonly { id: PlayerId; hand: Card[] }[],
  options: RoundScoreOptions = {},
): Record<PlayerId, number> {
  const twoPenalty = options.twoPenalty ?? DEFAULT_TWO_PENALTY;
  const placeOf = new Map(finishOrder.map((id, place) => [id, place]));

  const points: Record<PlayerId, number> = {};
  for (const player of players) {
    const place = placeOf.get(player.id) ?? players.length - 1;
    points[player.id] = placementPoints(place) - twosHeld(player.hand) * twoPenalty;
  }
  return points;
}

/** Adds a round's points onto a running match total. Pure — neither input is mutated. */
export function addScores(
  total: Record<PlayerId, number>,
  round: Record<PlayerId, number>,
): Record<PlayerId, number> {
  const next: Record<PlayerId, number> = { ...total };
  for (const [id, points] of Object.entries(round)) {
    next[id] = (next[id] ?? 0) + points;
  }
  return next;
}
