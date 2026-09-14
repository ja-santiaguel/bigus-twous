import { describe, expect, it } from 'vitest';
import { detectCombo } from '../src/combos.js';
import { getTurnOptions, playTurn } from '../src/orchestrator.js';
import type { Player } from '../src/player.js';
import { createRng } from '../src/rng.js';
import { applyPass, applyPlay, createNewRound, type GameState } from '../src/state.js';
import type { Card } from '../src/types.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const combo = (cards: Card[]) => detectCombo(cards)!;
const PLAYER_IDS = ['p1', 'p2', 'p3', 'p4'];

/**
 * Builds a mid-round state directly. Reaching a forced two-bust through real
 * play requires a very specific deal, so these tests construct the position
 * rather than hunting for it.
 */
function stateWithPile(handOfCurrentPlayer: Card[], pile: ReturnType<typeof combo> | null): GameState {
  const base = createNewRound(PLAYER_IDS, createRng('constraint'), 'constraint', 1, null, {});
  return {
    ...base,
    firstPlayPending: false,
    turnIndex: 0,
    players: base.players.map((p, i) => (i === 0 ? { ...p, hand: handOfCurrentPlayer } : p)),
    trick: { pile, lastPlayedBy: pile ? 'p2' : null, passCount: 0 },
  };
}

describe('passing and the forced two-bust (9.7)', () => {
  it('a player who passed cannot bomb a 2 played later in the same trick — nothing overrides passing', () => {
    // The position is built directly: seat, hand and trick exactly as the
    // situation needs, rather than simulating games until one happens to arise.
    const base = createNewRound(PLAYER_IDS, createRng('passing'), 'passing', 1, null, {});
    const hands: Card[][] = [
      [c('6', 'SPADE'), c('6', 'CLUB'), c('6', 'DIAMOND'), c('6', 'HEART'), c('4', 'CLUB')],
      [c('2', 'SPADE'), c('9', 'HEART')],
      [c('5', 'DIAMOND'), c('8', 'CLUB')],
      [c('A', 'SPADE'), c('7', 'DIAMOND')],
    ];
    let state: GameState = {
      ...base,
      firstPlayPending: false,
      turnIndex: 0,
      players: base.players.map((p, i) => ({ ...p, hand: hands[i]! })),
      trick: { pile: combo([c('K', 'HEART')]), lastPlayedBy: 'p4', passed: [], passCount: 0 },
    };
    const onTurn = () => state.players[state.turnIndex]!.id;

    // p1 holds four 6s, but passes on the king.
    state = applyPass(state, 'p1');
    expect(onTurn()).toBe('p2');

    // p2 answers with a single 2 — exactly what p1's four of a kind could chop.
    state = applyPlay(state, 'p2', combo([c('2', 'SPADE')]));
    expect(onTurn()).toBe('p3');
    state = applyPass(state, 'p3');

    // The turn goes straight past p1: having passed, they are out of this trick.
    expect(onTurn()).toBe('p4');
    state = applyPass(state, 'p4');

    // And the trick closes to p2 without p1 ever being asked.
    expect(state.history[state.history.length - 1]).toMatchObject({ type: 'TRICK_RESET', wonBy: 'p2' });
    expect(onTurn()).toBe('p2');
  });
});

describe('TurnOptions.constraint', () => {
  it('reports FORCED_OPENING on the first play of a round, carrying the required card', () => {
    const state = createNewRound(PLAYER_IDS, createRng('open'), 'open', 1, null, {});
    const { constraint, canPass, legalMoves } = getTurnOptions(state);
    expect(constraint.kind).toBe('FORCED_OPENING');
    if (constraint.kind === 'FORCED_OPENING') {
      expect(constraint.card).toEqual(state.openingCard);
    }
    expect(canPass).toBe(false);
    // Not a single move any more: every combo built around the opening card is
    // on the table, which is the whole point of the 9.1 clarification.
    expect(legalMoves.length).toBeGreaterThan(0);
    for (const move of legalMoves) {
      expect(move.cards.some((c) => c.rank === state.openingCard.rank && c.suit === state.openingCard.suit)).toBe(true);
    }
  });

  it('reports NONE when leading a fresh trick — free choice, but still no passing', () => {
    const state = stateWithPile([c('5', 'SPADE'), c('9', 'HEART')], null);
    const { constraint, canPass } = getTurnOptions(state);
    expect(constraint.kind).toBe('NONE');
    expect(canPass).toBe(false);
  });

  it('reports NONE on an ordinary turn where passing is allowed', () => {
    const state = stateWithPile([c('9', 'HEART')], combo([c('5', 'SPADE')]));
    const { constraint, canPass } = getTurnOptions(state);
    expect(constraint.kind).toBe('NONE');
    expect(canPass).toBe(true);
  });

  it('reports FORCED_TWO_BUST with the offending pile when a bomb must be played (9.5)', () => {
    const hand = [
      c('7', 'SPADE'),
      c('7', 'CLUB'),
      c('8', 'SPADE'),
      c('8', 'CLUB'),
      c('9', 'SPADE'),
      c('9', 'CLUB'),
      c('4', 'DIAMOND'),
    ];
    const pile = combo([c('2', 'SPADE')]);
    const state = stateWithPile(hand, pile);
    const { constraint, canPass, legalMoves } = getTurnOptions(state);

    expect(constraint.kind).toBe('FORCED_TWO_BUST');
    if (constraint.kind === 'FORCED_TWO_BUST') expect(constraint.pile).toEqual(pile);
    expect(canPass).toBe(false);
    expect(legalMoves.every((m) => m.type === 'PAIR_CHAIN')).toBe(true);
  });

  it('does not force a bust when the hand holds no qualifying bomb', () => {
    const state = stateWithPile([c('7', 'SPADE'), c('2', 'HEART')], combo([c('2', 'SPADE')]));
    const { constraint, canPass } = getTurnOptions(state);
    // A higher-suited Two is a normal beat, not a chop (9.5) — so no force.
    expect(constraint.kind).toBe('NONE');
    expect(canPass).toBe(true);
  });

  it('is consistent with canPass: a constrained turn never allows passing', async () => {
    // Walk a real round and assert the invariant on every single turn.
    let state = createNewRound(PLAYER_IDS, createRng('invariant'), 'invariant', 1, null, {});
    const players = new Map<string, Player>(
      PLAYER_IDS.map((id) => [
        id,
        {
          id,
          async getMove(_v, legalMoves, canPass) {
            if (legalMoves.length > 0) return { kind: 'PLAY', combo: legalMoves[0]! };
            if (canPass) return { kind: 'PASS' };
            throw new Error('stuck');
          },
        },
      ]),
    );

    while (state.phase !== 'ROUND_END') {
      const { constraint, canPass } = getTurnOptions(state);
      if (constraint.kind !== 'NONE') expect(canPass).toBe(false);
      state = await playTurn(state, players);
    }
  });
});
