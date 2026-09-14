import type { Combo } from './types.js';
import type { Move } from './legalMoves.js';
import type { PlayerView } from './state.js';

/**
 * Every seat at the table — human, CPU, or (eventually) a network-connected
 * remote player — implements this exact same interface. The orchestrator
 * never knows or cares which kind it's talking to. This is the seam that
 * makes multiplayer additive later: swap in a RemotePlayer that awaits a
 * socket message instead of computing a move locally, and nothing else in
 * the engine, CPU strategies, or turn-management logic has to change.
 *
 * Deliberately async even for CPUs — never assume a move resolves
 * synchronously, since network players won't.
 */
export interface Player {
  id: string;
  /**
   * @param view Redacted, per-player view — this is ALL a Player implementation may see. Never the full GameState.
   * @param legalMoves The precomputed set of combos this player may play right now (see getLegalMoves).
   * @param canPass Whether passing is a legal choice this turn (false when leading, or when a forced bust bomb is available).
   */
  getMove(view: PlayerView, legalMoves: Combo[], canPass: boolean): Promise<Move>;
}
