import { DEFAULT_RULE_CONFIG, type Player, type RuleConfig } from '@big-two/engine';
import type { HeuristicWeights } from './lib/evaluate.js';
import { createGreedyLowestPlayer } from './strategies/greedyLowest.js';
import { createHeuristicPlayer } from './strategies/heuristic.js';

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * The tiers are a ladder of *how much a CPU notices*, not a set of forked
 * decision trees. All three run the same evaluator; each tier switches on one
 * more layer of awareness.
 *
 *   easy   — no hand planning at all. Sheds the smallest legal thing it can.
 *   medium — plans the hand, protects structure, sheds in bulk, and keeps its
 *            Twos and bombs back. Plays the cards in front of it competently
 *            but does not track the table.
 *   hard   — all of the above, plus card counting and hard-nosed denial of the
 *            lead to anyone close to going out.
 *
 * The numbers below were fitted by simulation (see src/dev/tune.ts), not
 * chosen by intuition — the first hand-picked set lost to the naive baseline.
 */

/**
 * Medium's blind spots are deliberate and specific: it cannot tell a
 * guaranteed-unbeatable play from a merely-strong one, and it reacts mildly
 * rather than urgently when an opponent is about to go out. Both are exactly
 * the things a decent casual player misses.
 */
export const MEDIUM_WEIGHTS: HeuristicWeights = {
  label: 'medium',
  fracturePenalty: 2.2,
  strengthPenalty: 3.0,
  leadStrengthMultiplier: 2.0,
  cardsShedBonus: 2.0,
  twoHoldPenalty: 1.2,
  bombHoldPenalty: 4.0,
  planProgressBonus: 3.5,
  tempoBonus: 1.0,
  // Re-fitted when passing became a forfeit of the whole trick (9.7) rather
  // than of one turn. The old 1.0 was tuned under the cheaper rule and became
  // actively bad under this one — medium fell from 42.9% to 31.3% against a
  // field of easy CPUs while hard, already contesting at 0.6, barely moved.
  // The curve is noisy below 0.6 and smooth above it, so this takes the stable
  // side rather than the 0.4 spike, which looks like seed overfit.
  passThreshold: 0.7,
  useCardTracking: false,
  unbeatableBonus: 0,
  unbeatableLeadMultiplier: 0,
  threatUrgency: 6.0,
  threatThreshold: 3,
};

/**
 * Hard counts cards. Knowing for certain that a play cannot be answered turns
 * a guess into a fact, which changes two things: it will happily spend a big
 * card when that card is guaranteed to buy the lead, and it will not lead into
 * a player on their last few cards with anything they could take. It also
 * contests tricks more readily (lower pass threshold), because it is much
 * better at telling the winnable ones from the rest.
 */
export const HARD_WEIGHTS: HeuristicWeights = {
  label: 'hard',
  fracturePenalty: 2.2,
  strengthPenalty: 3.0,
  leadStrengthMultiplier: 2.0,
  cardsShedBonus: 2.0,
  twoHoldPenalty: 1.2,
  bombHoldPenalty: 4.0,
  planProgressBonus: 3.5,
  tempoBonus: 1.0,
  passThreshold: 0.6,
  useCardTracking: true,
  unbeatableBonus: 6.0,
  unbeatableLeadMultiplier: 0.25,
  threatUrgency: 8.0,
  threatThreshold: 3,
};

export const WEIGHTS_BY_DIFFICULTY: Record<Exclude<Difficulty, 'easy'>, HeuristicWeights> = {
  medium: MEDIUM_WEIGHTS,
  hard: HARD_WEIGHTS,
};

/**
 * The single entry point the app and the simulator both use. Every tier
 * returns a plain `Player`, so nothing downstream — orchestrator, UI, future
 * network layer — knows or cares which difficulty it is talking to.
 */
export function createCpuPlayer(id: string, difficulty: Difficulty, rules: RuleConfig = DEFAULT_RULE_CONFIG): Player {
  if (difficulty === 'easy') return createGreedyLowestPlayer(id);
  return createHeuristicPlayer(id, WEIGHTS_BY_DIFFICULTY[difficulty], rules);
}

export function isDifficulty(value: string): value is Difficulty {
  return (DIFFICULTIES as string[]).includes(value);
}
