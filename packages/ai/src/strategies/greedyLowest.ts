import type { Move, Player, PlayerView } from '@big-two/engine';
import type { Combo } from '@big-two/engine';

/**
 * The most basic viable CPU strategy: always play the weakest legal combo
 * available (preferring to shed low singles/pairs before anything else),
 * and pass whenever passing is legal and no play is compulsory. This is a
 * deliberately simple placeholder for Phase 3 — real difficulty tiers
 * (e.g. holding bombs strategically, counting cards, blocking opponents
 * close to winning) are out of scope for this session.
 *
 * Note this function only ever sees `PlayerView` (redacted state) and the
 * precomputed `legalMoves` — never the full GameState — so it is physically
 * incapable of seeing opponents' hands. A future RemotePlayer will plug into
 * the exact same `Player` interface.
 */
export function createGreedyLowestPlayer(id: string): Player {
  return {
    id,
    async getMove(_view: PlayerView, legalMoves: Combo[], canPass: boolean): Promise<Move> {
      if (legalMoves.length === 0) {
        if (canPass) return { kind: 'PASS' };
        throw new Error(`${id}: no legal moves and passing is not allowed — engine invariant violated.`);
      }

      // Prefer the smallest combo (by cards.length, then by strength) to
      // avoid needlessly burning strong combos early. This is a heuristic,
      // not a rule — future strategies can override this selection freely.
      const weakest = legalMoves.reduce((best, candidate) => {
        if (candidate.cards.length !== best.cards.length) {
          return candidate.cards.length < best.cards.length ? candidate : best;
        }
        return candidate.strength < best.strength ? candidate : best;
      });

      return { kind: 'PLAY', combo: weakest };
    },
  };
}
