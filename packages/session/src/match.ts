import type { PlayerId } from '@big-two/engine';
import type { MatchRule } from './types.js';

/**
 * How long a match runs, and who has won it (9.17).
 *
 * Two kinds, each with a short fixed menu rather than a free number: a lobby
 * setting people can agree on at a glance, and a server that only ever has to
 * accept one of five answers.
 *
 *   points   first to 15, 30 or 50 — a race, and the default at 30
 *   rounds   the most points after 5 or 10 — a known length
 */

export const MATCH_POINT_TARGETS = [15, 30, 50] as const;
export const MATCH_ROUND_COUNTS = [5, 10] as const;

/** First to 30: roughly seven to ten rounds, twenty to thirty minutes. */
export const DEFAULT_MATCH: MatchRule = { kind: 'points', target: 30 };

export function isMatchRule(value: unknown): value is MatchRule {
  if (typeof value !== 'object' || value === null) return false;
  const rule = value as Record<string, unknown>;
  if (rule['kind'] === 'points') return (MATCH_POINT_TARGETS as readonly unknown[]).includes(rule['target']);
  if (rule['kind'] === 'rounds') return (MATCH_ROUND_COUNTS as readonly unknown[]).includes(rule['count']);
  return false;
}

/**
 * The match winner once the match is over, or null while it runs.
 *
 * Checked when a round ends. The rule decides whether the match *can* end —
 * someone has reached the target, or the rounds are used up — and then the
 * standings decide who won: most points, then most rounds won outright. If the
 * top two are level on both, nobody has won yet and one more round is played,
 * which is the only tie-break that never hands a match to a coin toss.
 */
export function decideMatch(
  rule: MatchRule,
  standings: { points: Record<PlayerId, number>; roundsWon: Record<PlayerId, number>; roundNumber: number },
  players: PlayerId[],
): PlayerId | null {
  const points = (id: PlayerId) => standings.points[id] ?? 0;
  const wins = (id: PlayerId) => standings.roundsWon[id] ?? 0;

  const over =
    rule.kind === 'points' ? players.some((id) => points(id) >= rule.target) : standings.roundNumber >= rule.count;
  if (!over) return null;

  const [first, second] = [...players].sort((a, b) => points(b) - points(a) || wins(b) - wins(a));
  if (!first) return null;
  if (second && points(first) === points(second) && wins(first) === wins(second)) return null;
  return first;
}
