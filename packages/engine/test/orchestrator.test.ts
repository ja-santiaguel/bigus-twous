import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng.js';
import { cardValue } from '../src/types.js';
import { createNewRound } from '../src/state.js';
import { getTurnOptions, playTurn, runRoundToCompletion } from '../src/orchestrator.js';
import type { Player } from '../src/player.js';
import type { Move } from '../src/legalMoves.js';

/**
 * The simplest possible legal Player: always plays its first legal move if
 * it cannot pass, otherwise plays if a move exists and passes only when
 * forced to have no better option. This is intentionally dumber than any
 * real CPU strategy (Phase 3) — it exists purely to exercise the
 * orchestrator's rules end-to-end.
 */
function makeDumbPlayer(id: string): Player {
  return {
    id,
    async getMove(_view, legalMoves, canPass): Promise<Move> {
      if (legalMoves.length > 0) return { kind: 'PLAY', combo: legalMoves[0]! };
      if (canPass) return { kind: 'PASS' };
      throw new Error(`${id} has no legal moves and cannot pass — this should never happen.`);
    },
  };
}

const PLAYER_IDS = ['p1', 'p2', 'p3', 'p4'];

function buildPlayers(): Map<string, Player> {
  return new Map(PLAYER_IDS.map((id) => [id, makeDumbPlayer(id)]));
}

describe('getTurnOptions', () => {
  it('lets the opener play any combo, so long as it contains the opening card (9.1)', () => {
    const state = createNewRound(PLAYER_IDS, createRng('seed-1'), 'seed-1', 1, null, {});
    const options = getTurnOptions(state);
    expect(options.canPass).toBe(false);

    // Every offered move contains the opening card...
    expect(options.legalMoves.length).toBeGreaterThan(1);
    for (const move of options.legalMoves) {
      expect(move.cards.some((c) => c.rank === state.openingCard.rank && c.suit === state.openingCard.suit)).toBe(true);
    }
    // ...and the plain single is still among them, so nothing is lost.
    expect(options.legalMoves.some((m) => m.type === 'SINGLE')).toBe(true);
  });

  it('the very first round opens on the 3 of Spades, held by the starter', () => {
    const state = createNewRound(PLAYER_IDS, createRng('seed-1'), 'seed-1', 1, null, {});
    expect(state.openingCard).toEqual({ rank: '3', suit: 'SPADE' });
  });
});

describe('playTurn', () => {
  it('rejects a pass attempt when passing is not legal', async () => {
    const state = createNewRound(PLAYER_IDS, createRng('seed-1'), 'seed-1', 1, null, {});
    const players = new Map<string, Player>([
      [
        state.players[state.turnIndex]!.id,
        {
          id: 'x',
          async getMove() {
            return { kind: 'PASS' };
          },
        },
      ],
    ]);
    await expect(playTurn(state, players)).rejects.toThrow(/not legal/);
  });

  it('rejects an illegal combo that was not in the legal moves list', async () => {
    const state = createNewRound(PLAYER_IDS, createRng('seed-1'), 'seed-1', 1, null, {});
    const bogusCombo = {
      type: 'SINGLE' as const,
      cards: [{ rank: 'K' as const, suit: 'HEART' as const }],
      strength: 999,
    };
    const players = new Map<string, Player>([
      [
        state.players[state.turnIndex]!.id,
        {
          id: 'x',
          async getMove() {
            return { kind: 'PLAY', combo: bogusCombo };
          },
        },
      ],
    ]);
    await expect(playTurn(state, players)).rejects.toThrow(/illegal move/);
  });
});

describe('runRoundToCompletion — full headless simulation', () => {
  it('reaches ROUND_END with exactly one winner, using deterministic dumb players', async () => {
    const state = createNewRound(PLAYER_IDS, createRng('seed-42'), 'seed-42', 1, null, {});
    const final = await runRoundToCompletion(state, buildPlayers());

    expect(final.phase).toBe('ROUND_END');
    expect(final.winnerOfRound).not.toBeNull();
    expect(PLAYER_IDS).toContain(final.winnerOfRound);

    const winner = final.players.find((p) => p.id === final.winnerOfRound)!;
    expect(winner.hand.length).toBe(0);

    expect(final.roundsWon[final.winnerOfRound!]).toBe(1);
  });

  it('produces a deterministic, reproducible game for the same seed', async () => {
    const stateA = createNewRound(PLAYER_IDS, createRng('seed-99'), 'seed-99', 1, null, {});
    const stateB = createNewRound(PLAYER_IDS, createRng('seed-99'), 'seed-99', 1, null, {});
    const finalA = await runRoundToCompletion(stateA, buildPlayers());
    const finalB = await runRoundToCompletion(stateB, buildPlayers());
    expect(finalA.winnerOfRound).toBe(finalB.winnerOfRound);
    expect(finalA.history.length).toBe(finalB.history.length);
  });

  it('runs many random-seeded games without ever throwing (broad rules-engine smoke test)', async () => {
    for (let i = 0; i < 25; i++) {
      const seed = `smoke-${i}`;
      const state = createNewRound(PLAYER_IDS, createRng(seed), seed, 1, null, {});
      const final = await runRoundToCompletion(state, buildPlayers());
      expect(final.phase).toBe('ROUND_END');
    }
  });
});

describe('session continuity (9.1, 9.8)', () => {
  it('round 2 starter is the round 1 winner, forced to open with their lowest single', async () => {
    const round1 = createNewRound(PLAYER_IDS, createRng('seed-7'), 'seed-7', 1, null, {});
    const round1Final = await runRoundToCompletion(round1, buildPlayers());
    const winnerId = round1Final.winnerOfRound!;

    const round2 = createNewRound(PLAYER_IDS, createRng('seed-8'), 'seed-8', 2, winnerId, round1Final.roundsWon);

    expect(round2.players[round2.turnIndex]!.id).toBe(winnerId);
    // In a later round the opening card is the winner's *own* lowest card —
    // there is no 3 of Spades rule once round one is over.
    const winnerHand = round2.players.find((p) => p.id === winnerId)!.hand;
    const lowest = winnerHand.reduce((min, card) => (cardValue(card) < cardValue(min) ? card : min));
    expect(round2.openingCard).toEqual(lowest);
  });
});
