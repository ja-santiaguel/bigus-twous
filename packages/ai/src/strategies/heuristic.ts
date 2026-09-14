import {
  DEFAULT_RULE_CONFIG,
  type Combo,
  type Move,
  type Player,
  type PlayerView,
  type RuleConfig,
} from '@big-two/engine';
import { planHand } from '../lib/handPlan.js';
import { trackCards } from '../lib/cardTracker.js';
import { readTrickContext } from '../lib/trickContext.js';
import { bestMove, scoreMove, type HeuristicWeights } from '../lib/evaluate.js';

/**
 * The competitive CPU strategy. One implementation, parameterised by weights —
 * see difficulty.ts for the tier presets.
 *
 * Shape of a turn:
 *   1. Decompose the hand into a plan (how few plays can I go out in?).
 *   2. Read the trick from the event log (who can still answer me, who's close
 *      to going out).
 *   3. Optionally count cards to find plays nothing can answer.
 *   4. Score every legal move and either play the best one or pass.
 *
 * Forced situations need no special handling here: the orchestrator has
 * already collapsed `legalMoves` to the permitted set for a forced opening
 * (9.1) and a forced two-bust (9.5), and sets `canPass` to false. This
 * strategy simply picks the least damaging option from whatever it is handed,
 * which is exactly the right behaviour in both cases.
 *
 * Like every Player, it only ever sees the redacted PlayerView — it cannot
 * see opponents' hands even in principle.
 */
export function createHeuristicPlayer(
  id: string,
  weights: HeuristicWeights,
  rules: RuleConfig = DEFAULT_RULE_CONFIG,
): Player {
  return {
    id,
    async getMove(view: PlayerView, legalMoves: Combo[], canPass: boolean): Promise<Move> {
      if (legalMoves.length === 0) {
        if (canPass) return { kind: 'PASS' };
        throw new Error(`${id}: no legal moves and passing is not allowed — engine invariant violated.`);
      }

      const plan = planHand(view.hand, rules);
      const trick = readTrickContext(view, weights.threatThreshold);
      const knowledge = weights.useCardTracking ? trackCards(view, rules) : null;
      const leading = view.pile === null;

      const best = bestMove(legalMoves, (combo) =>
        scoreMove({ combo, plan, trick, knowledge, weights, leading, handSize: view.hand.length }),
      )!;

      // Leading, or forced: there is no pass option to weigh against.
      if (!canPass) return { kind: 'PLAY', combo: best.combo };

      // Following: only contest the trick if the best available play is worth
      // more than the cards it costs. Passing here is a real move, not a
      // failure — holding structure for a trick you can lead is usually better
      // than winning a trick by shredding your hand.
      if (best.score >= weights.passThreshold) return { kind: 'PLAY', combo: best.combo };
      return { kind: 'PASS' };
    },
  };
}
