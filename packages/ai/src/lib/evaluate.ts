import { type Combo, isBombType } from '@big-two/engine';
import { fractureCost, type HandPlan } from './handPlan.js';
import type { CardKnowledge } from './cardTracker.js';
import type { TrickContext } from './trickContext.js';

/**
 * Move evaluation. All difficulty tiers share this one scoring function; a
 * tier *is* a set of weights, not a forked decision tree. That keeps the
 * behavioural difference between Medium and Hard auditable (you can diff two
 * objects) and makes tuning a matter of simulation rather than rewriting code.
 *
 * The score is expressed relative to passing, which is always worth exactly
 * zero. So a positive score means "this play is worth more than sitting the
 * trick out", and `passThreshold` is the margin a tier demands before it
 * commits cards.
 */
export interface HeuristicWeights {
  label: string;
  /** Cost per load-bearing card torn out of the hand plan. The core "don't break your straight" term. */
  fracturePenalty: number;
  /** Cost proportional to how strong the cards being spent are. Discourages burning Aces on nothing. */
  strengthPenalty: number;
  /**
   * Multiplier applied to strengthPenalty when leading. Leading a high card is
   * close to pure waste — you spend your best answer on a trick nobody has
   * contested yet — so height costs more here than when following.
   */
  leadStrengthMultiplier: number;
  /**
   * Reward per extra card shed in one play. Emptying the hand is the win
   * condition, so a five-card straight is worth materially more than a single
   * even when the two cost the same structurally.
   */
  cardsShedBonus: number;
  /** Extra cost per rank-Two spent. Twos are the game's scarcest tempo resource. */
  twoHoldPenalty: number;
  /** Extra cost for voluntarily spending a bomb. */
  bombHoldPenalty: number;
  /** Reward for playing a combo the plan already wanted to play (fracture cost zero). */
  planProgressBonus: number;
  /** Reward for probably winning the trick and taking the lead. Applies when following only. */
  tempoBonus: number;
  /** Score a play must clear to be worth making instead of passing. */
  passThreshold: number;
  /** Whether this tier counts cards to recognise guaranteed-unbeatable plays. */
  useCardTracking: boolean;
  /** Reward when card counting proves nothing left in circulation can answer this play. */
  unbeatableBonus: number;
  /**
   * Multiplier applied to unbeatableBonus when leading. An unanswerable card is
   * at its most valuable *held*, because it is a guaranteed way to seize the
   * lead back later. Spending one while you already hold the lead converts a
   * re-entry ticket into a single shed card. Following is the opposite — there
   * the unanswerable play is what wins the trick — so the bonus applies in
   * full. Without this discount a card-counting CPU cheerfully opens with its
   * Twos and is measurably worse than one that cannot count at all.
   */
  unbeatableLeadMultiplier: number;
  /** How hard to fight for the lead when an opponent is close to going out. */
  threatUrgency: number;
  /** Opponent hand size at or below which they count as a threat. */
  threatThreshold: number;
}

export interface EvaluationInput {
  combo: Combo;
  plan: HandPlan;
  trick: TrickContext;
  knowledge: CardKnowledge | null;
  weights: HeuristicWeights;
  /** True when leading a fresh trick (no pile to beat). */
  leading: boolean;
  /** Total cards currently in hand — used to spot a hand-emptying play. */
  handSize: number;
}

/** Highest possible cardValue (rank Two of Hearts), used to normalise strength terms. */
const MAX_CARD_VALUE = 51;

export function scoreMove(input: EvaluationInput): number {
  const { combo, plan, trick, knowledge, weights, leading, handSize } = input;

  // A play that empties the hand wins the round outright. Nothing else can
  // ever be worth more, so short-circuit rather than trying to weight it.
  if (combo.cards.length === handSize) return Number.POSITIVE_INFINITY;

  let score = 0;

  // Shedding is the win condition. Without this term the evaluator has no
  // reason to prefer a five-card straight over a lone three.
  score += weights.cardsShedBonus * (combo.cards.length - 1);

  const fracture = fractureCost(plan, combo);
  if (fracture === 0) score += weights.planProgressBonus;
  score -= weights.fracturePenalty * fracture;

  const strengthWeight = weights.strengthPenalty * (leading ? weights.leadStrengthMultiplier : 1);
  score -= strengthWeight * (combo.strength / MAX_CARD_VALUE);

  score -= weights.twoHoldPenalty * combo.cards.filter((c) => c.rank === '2').length;
  if (isBombType(combo.type)) score -= weights.bombHoldPenalty;

  const unbeatable = weights.useCardTracking && knowledge !== null && knowledge.isUnbeatable(combo);
  if (unbeatable) {
    score += weights.unbeatableBonus * (leading ? weights.unbeatableLeadMultiplier : 1);
  }

  // Probability-ish estimate of holding the trick. With card tracking we know
  // for certain in the unbeatable case; otherwise fall back to "high cards
  // tend to survive", damped by how many opponents can still answer.
  const winChance = unbeatable ? 1 : estimateWinChance(combo, trick);

  // Tempo is only worth paying for when following. When leading you already
  // hold the initiative, so "winning" your own trick with a big card buys
  // nothing you did not already have — it just spends the card. Rewarding
  // tempo on a lead is exactly what makes a naive evaluator open with its Twos
  // and then sit on a hand of unplayable low cards for the rest of the game.
  if (!leading) score += weights.tempoBonus * winChance;

  // Denying the lead to someone about to go out is worth overpaying for.
  if (trick.threats.length > 0) {
    if (leading) {
      // Against a threat, a lead they can beat hands them the initiative. Only
      // a play that is certain to hold is actually worth making.
      score += weights.threatUrgency * (unbeatable ? 1 : -0.5);
    } else {
      score += weights.threatUrgency * winChance;
    }
  }

  return score;
}

/**
 * Crude but serviceable: strength as a fraction of the maximum, damped by the
 * number of opponents still able to respond. Only the tiers without card
 * tracking lean on this.
 */
function estimateWinChance(combo: Combo, trick: TrickContext): number {
  const base = combo.strength / MAX_CARD_VALUE;
  const responders = Math.max(1, trick.liveOpponents.length);
  return Math.pow(base, responders / 2);
}

/** Picks the highest-scoring move, deterministically (first wins on an exact tie). */
export function bestMove(candidates: Combo[], score: (c: Combo) => number): { combo: Combo; score: number } | null {
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestScore = score(best);
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const candidateScore = score(candidate);
    if (candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  return { combo: best, score: bestScore };
}
