import { enumerateCombos } from './combos.js';
import { canBeat, getForcedBustOptions } from './compareCombos.js';
import { getLegalMoves, openingMoves } from './legalMoves.js';
import type { Player } from './player.js';
import { applyPass, applyPlay, toPlayerView, type GameState } from './state.js';
import { DEFAULT_RULE_CONFIG, type Card, type Combo, type RuleConfig } from './types.js';

/**
 * Why a turn is constrained, when it is. The UI needs this to explain itself:
 * both forced states in this ruleset remove the Pass button, and without a
 * stated reason a player just finds it dead and assumes the game is broken.
 *
 * This lives in the engine rather than being re-derived by the UI so that
 * there is exactly one implementation of the rule. A client that recomputed
 * "am I forced?" independently is a client that can disagree with the server
 * once one exists.
 */
export type TurnConstraint =
  /** Ordinary turn — play anything legal, or pass if canPass. */
  | { kind: 'NONE' }
  /** Opening play of the round (9.1): any combo, as long as it contains this card. */
  | { kind: 'FORCED_OPENING'; card: Card }
  /** The pile is a Two-combo and this hand holds a qualifying bomb (9.5) — it must be played. */
  | { kind: 'FORCED_TWO_BUST'; pile: Combo };

export interface TurnOptions {
  legalMoves: Combo[];
  canPass: boolean;
  constraint: TurnConstraint;
}

/**
 * Computes what a player may do on their turn, accounting for:
 *  - the forced opening constraint (9.1) on the very first play of a round
 *  - the forced two-bust rule (9.5), which removes the option to pass or
 *    play a normal counter when a qualifying bomb is available
 *  - the ordinary "must lead, cannot pass" rule when the pile is empty
 */
export function getTurnOptions(state: GameState, rules: RuleConfig = DEFAULT_RULE_CONFIG): TurnOptions {
  const player = state.players[state.turnIndex]!;

  if (state.firstPlayPending) {
    // The opening is not a single forced card: it is any legal combo that
    // *contains* the starter's lowest card (9.1). Opening a straight or a pair
    // built around it is fine — what you may not do is hold it back.
    return {
      legalMoves: openingMoves(player.hand, state.openingCard, rules),
      canPass: false,
      constraint: { kind: 'FORCED_OPENING', card: state.openingCard },
    };
  }

  const pile = state.trick.pile;
  if (pile === null) {
    // Leading a fresh trick: free choice, but passing is not an option.
    return { legalMoves: enumerateCombos(player.hand, rules), canPass: false, constraint: { kind: 'NONE' } };
  }

  const available = enumerateCombos(player.hand, rules);
  const forced = getForcedBustOptions(pile, available, rules);
  if (forced.length > 0) {
    return { legalMoves: forced, canPass: false, constraint: { kind: 'FORCED_TWO_BUST', pile } };
  }

  return { legalMoves: getLegalMoves(player.hand, pile, rules), canPass: true, constraint: { kind: 'NONE' } };
}

function comboEquals(a: Combo, b: Combo): boolean {
  if (a.cards.length !== b.cards.length) return false;
  const idsA = new Set(a.cards.map((c) => `${c.rank}_${c.suit}`));
  return b.cards.every((c) => idsA.has(`${c.rank}_${c.suit}`));
}

/** Advances the game by exactly one player's turn. Validates the chosen move against the precomputed legal set. */
export async function playTurn(
  state: GameState,
  players: Map<string, Player>,
  rules: RuleConfig = DEFAULT_RULE_CONFIG,
): Promise<GameState> {
  const currentPlayerState = state.players[state.turnIndex]!;
  const player = players.get(currentPlayerState.id);
  if (!player) throw new Error(`No Player implementation registered for ${currentPlayerState.id}`);

  const { legalMoves, canPass } = getTurnOptions(state, rules);
  const view = toPlayerView(state, currentPlayerState.id);
  const move = await player.getMove(view, legalMoves, canPass);

  if (move.kind === 'PASS') {
    if (!canPass) throw new Error(`${currentPlayerState.id} attempted to pass when passing was not legal.`);
    return applyPass(state, currentPlayerState.id);
  }

  const isLegal = legalMoves.some((c) => comboEquals(c, move.combo));
  if (!isLegal) {
    throw new Error(`${currentPlayerState.id} attempted an illegal move: ${JSON.stringify(move.combo)}`);
  }
  // `applyPlay`/`applyPass` own the turn advance, because only they know
  // whether the trick just closed — a closing trick hands the turn back to its
  // winner rather than passing it to the next seat round.
  return applyPlay(state, currentPlayerState.id, move.combo);
}

/** Drives a round to completion by repeatedly calling playTurn. Used for headless CPU-vs-CPU simulation and tests. */
export async function runRoundToCompletion(
  initialState: GameState,
  players: Map<string, Player>,
  rules: RuleConfig = DEFAULT_RULE_CONFIG,
  maxTurns = 5000,
): Promise<GameState> {
  let state = initialState;
  let turns = 0;
  while (state.phase !== 'ROUND_END') {
    state = await playTurn(state, players, rules);
    turns++;
    if (turns > maxTurns) throw new Error('runRoundToCompletion exceeded maxTurns — likely an infinite loop bug.');
  }
  return state;
}

// Re-exported for convenience so consumers of the orchestrator don't need a
// second import from compareCombos just to sanity-check a move manually.
export { canBeat };
