import { describe, expect, it } from 'vitest';
import {
  cardId,
  createNewRound,
  createRng,
  getTurnOptions,
  playTurn,
  runRoundToCompletion,
  toPlayerView,
  type Combo,
  type GameState,
  type Move,
  type Player,
} from '@big-two/engine';
import { DIFFICULTIES, createCpuPlayer, type Difficulty } from '../src/difficulty.js';

const SEATS = ['s0', 's1', 's2', 's3'];

function newRound(seed: string): GameState {
  return createNewRound(SEATS, createRng(seed), seed, 1, null, {});
}

function comboKey(combo: Combo): string {
  return combo.cards.map(cardId).sort().join('|');
}

/**
 * Wraps a Player and asserts, on every single turn, that whatever it returns
 * was actually offered to it. This is the contract that matters most: the
 * orchestrator throws on an illegal move, so a strategy that drifts out of the
 * legal set would take the whole game down — including, later, a live
 * multiplayer table.
 */
function assertingPlayer(inner: Player): Player {
  return {
    id: inner.id,
    async getMove(view, legalMoves, canPass): Promise<Move> {
      const move = await inner.getMove(view, legalMoves, canPass);
      if (move.kind === 'PASS') {
        expect(canPass, `${inner.id} passed when passing was illegal`).toBe(true);
        return move;
      }
      const offered = new Set(legalMoves.map(comboKey));
      expect(offered.has(comboKey(move.combo)), `${inner.id} played a combo it was never offered`).toBe(true);
      // A strategy must never play cards it does not hold.
      const held = new Set(view.hand.map(cardId));
      for (const card of move.combo.cards) {
        expect(held.has(cardId(card)), `${inner.id} played a card not in its hand`).toBe(true);
      }
      return move;
    },
  };
}

describe.each(DIFFICULTIES)('Player contract — %s', (difficulty: Difficulty) => {
  it('never returns a move outside the offered legal set, across many full games', async () => {
    for (let i = 0; i < 25; i++) {
      const players = new Map<string, Player>(
        SEATS.map((id) => [id, assertingPlayer(createCpuPlayer(id, difficulty))]),
      );
      const final = await runRoundToCompletion(newRound(`contract-${difficulty}-${i}`), players);
      expect(final.phase).toBe('ROUND_END');
      expect(final.winnerOfRound).not.toBeNull();
      expect(final.players.find((p) => p.id === final.winnerOfRound)!.hand).toHaveLength(0);
    }
  });

  it('is deterministic — the same seed produces the same game', async () => {
    const run = async () => {
      const players = new Map<string, Player>(SEATS.map((id) => [id, createCpuPlayer(id, difficulty)]));
      const final = await runRoundToCompletion(newRound(`determinism-${difficulty}`), players);
      return JSON.stringify(final.history);
    };
    expect(await run()).toBe(await run());
  });

  it('honours the forced opening on the very first play of a round', async () => {
    const state = newRound(`opening-${difficulty}`);
    const { legalMoves, canPass } = getTurnOptions(state);
    expect(canPass).toBe(false);
    // The opening is a choice now (9.1) — any combo built around the opening
    // card — so the contract is that the CPU picks one of those, not that only
    // one exists.
    expect(legalMoves.length).toBeGreaterThan(0);

    const starter = state.players[state.turnIndex]!;
    const player = createCpuPlayer(starter.id, difficulty);
    const move = await player.getMove(toPlayerView(state, starter.id), legalMoves, canPass);
    expect(move.kind).toBe('PLAY');
    const chosen = (move as { combo: Combo }).combo;
    expect(legalMoves.map(comboKey)).toContain(comboKey(chosen));
    expect(
      chosen.cards.some((c) => c.rank === state.openingCard.rank && c.suit === state.openingCard.suit),
    ).toBe(true);
  });

  it('plays a forced two-bust bomb rather than passing when the engine compels it', async () => {
    // Drive a real game until a forced-bust turn shows up, then assert the CPU
    // takes one of the bombs it was handed. Not every seed produces one, so
    // this walks several seeds and asserts on whichever hits first.
    let sawForcedBust = false;
    for (let i = 0; i < 60 && !sawForcedBust; i++) {
      let state = newRound(`bust-${difficulty}-${i}`);
      const players = new Map<string, Player>(SEATS.map((id) => [id, createCpuPlayer(id, difficulty)]));
      while (state.phase !== 'ROUND_END') {
        const options = getTurnOptions(state);
        const isForcedBust =
          !state.firstPlayPending &&
          state.trick.pile !== null &&
          !options.canPass &&
          options.legalMoves.every((m) => m.type === 'FOUR_OF_A_KIND' || m.type === 'PAIR_CHAIN');

        if (isForcedBust) {
          const seat = state.players[state.turnIndex]!;
          const move = await players.get(seat.id)!.getMove(toPlayerView(state, seat.id), options.legalMoves, false);
          expect(move.kind).toBe('PLAY');
          sawForcedBust = true;
          break;
        }
        state = await playTurn(state, players);
      }
    }
    expect(sawForcedBust, 'no forced two-bust occurred in 60 seeded games — widen the search').toBe(true);
  });
});
