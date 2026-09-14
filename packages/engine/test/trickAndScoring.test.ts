import { describe, expect, it } from 'vitest';
import { detectCombo } from '../src/combos.js';
import { createRng } from '../src/rng.js';
import { applyPass, applyPlay, createNewRound, type GameState } from '../src/state.js';
import { addScores, PLACEMENT_POINTS, scoreRound, twosHeld } from '../src/scoring.js';
import { handsFromClaims, dealPiles } from '../src/cards.js';
import { getTurnOptions, runRoundToCompletion } from '../src/orchestrator.js';
import type { Player } from '../src/player.js';
import { cardValue, type Card } from '../src/types.js';

const IDS = ['p1', 'p2', 'p3', 'p4'];

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const combo = (...cards: Card[]) => detectCombo(cards)!;

/**
 * A state built by hand, so a rule can be exercised on a known table rather
 * than whatever a seed happens to deal. `hands` are in seat order.
 */
function stateWith(hands: Card[][], turnIndex = 0): GameState {
  return {
    players: IDS.map((id, seat) => ({ id, seat, hand: hands[seat] ?? [] })),
    turnIndex,
    trick: { pile: null, lastPlayedBy: null, passed: [], passCount: 0 },
    roundNumber: 1,
    rngSeed: 'handmade',
    phase: 'PLAYING',
    history: [],
    roundsWon: {},
    points: {},
    finishOrder: [],
    openingCard: c('3', 'SPADE'),
    firstPlayPending: false,
    winnerOfRound: null,
  };
}

const current = (state: GameState) => state.players[state.turnIndex]!.id;

describe('passing forfeits the whole trick (9.7)', () => {
  it('skips a seat that has passed, even after someone else plays', () => {
    let state = stateWith([
      [c('5', 'SPADE'), c('6', 'SPADE')],
      [c('7', 'SPADE'), c('8', 'SPADE')],
      [c('9', 'SPADE'), c('10', 'SPADE')],
      [c('J', 'SPADE'), c('Q', 'SPADE')],
    ]);

    state = applyPlay(state, 'p1', combo(c('5', 'SPADE')));
    expect(current(state)).toBe('p2');

    state = applyPass(state, 'p2');
    expect(state.trick.passed).toEqual(['p2']);
    expect(current(state)).toBe('p3');

    // p3 answers. Under the old rule the turn would come back around to p2;
    // it must not — p2 forfeited the trick, not merely one turn.
    state = applyPlay(state, 'p3', combo(c('9', 'SPADE')));
    expect(state.trick.passed).toEqual(['p2']);
    expect(current(state)).toBe('p4');

    state = applyPass(state, 'p4');
    // Only p1 is left who may answer p3 — p2 is out of the trick.
    expect(current(state)).toBe('p1');
  });

  it('closes the trick and gives the lead to whoever took it', () => {
    let state = stateWith([
      [c('5', 'SPADE'), c('6', 'SPADE')],
      [c('7', 'SPADE'), c('8', 'SPADE')],
      [c('9', 'SPADE'), c('10', 'SPADE')],
      [c('J', 'SPADE'), c('Q', 'SPADE')],
    ]);

    state = applyPlay(state, 'p1', combo(c('5', 'SPADE')));
    state = applyPass(state, 'p2');
    state = applyPass(state, 'p3');
    state = applyPass(state, 'p4');

    expect(state.trick.pile).toBeNull();
    expect(state.trick.passed).toEqual([]);
    expect(current(state)).toBe('p1');
    expect(state.history.at(-1)).toMatchObject({ type: 'TRICK_RESET', leader: 'p1', wonBy: 'p1' });
  });

  it('passes the lead on when the player who took the trick has gone out', () => {
    let state = stateWith([
      [c('5', 'SPADE')], // p1 goes out taking this trick
      [c('7', 'SPADE'), c('8', 'SPADE')],
      [c('9', 'SPADE'), c('10', 'SPADE')],
      [c('J', 'SPADE'), c('Q', 'SPADE')],
    ]);

    state = applyPlay(state, 'p1', combo(c('5', 'SPADE')));
    expect(state.finishOrder).toEqual(['p1']);
    state = applyPass(state, 'p2');
    state = applyPass(state, 'p3');
    state = applyPass(state, 'p4');

    // p1 won the trick but holds nothing, so the lead moves clockwise.
    expect(state.history.at(-1)).toMatchObject({ type: 'TRICK_RESET', leader: 'p2', wonBy: 'p1' });
    expect(current(state)).toBe('p2');
  });

  it('closes a trick on a play, when everyone else is already out of it', () => {
    let state = stateWith([
      [c('5', 'SPADE')],
      [c('7', 'SPADE'), c('8', 'SPADE')],
      [c('9', 'SPADE'), c('10', 'SPADE')],
      [c('J', 'SPADE'), c('Q', 'SPADE')],
    ]);

    state = applyPlay(state, 'p1', combo(c('5', 'SPADE'))); // p1 out
    state = applyPass(state, 'p2');
    state = applyPass(state, 'p3');
    // p4 answers a pile whose owner has gone out and whose other contenders
    // have passed. Nobody can reply, so the trick closes on the play itself.
    state = applyPlay(state, 'p4', combo(c('J', 'SPADE')));

    expect(state.trick.pile).toBeNull();
    expect(current(state)).toBe('p4');
    expect(state.history.at(-1)).toMatchObject({ type: 'TRICK_RESET', leader: 'p4', wonBy: 'p4' });
  });
});

describe('the round runs to placements (9.15)', () => {
  it('keeps playing after the first player goes out, and ends at three', () => {
    let state = stateWith([
      [c('5', 'SPADE')],
      [c('7', 'SPADE')],
      [c('9', 'SPADE')],
      [c('J', 'SPADE'), c('2', 'HEART')],
    ]);

    state = applyPlay(state, 'p1', combo(c('5', 'SPADE')));
    expect(state.phase).toBe('PLAYING');
    expect(state.history.at(-1)).toMatchObject({ type: 'PLAYER_FINISHED', playerId: 'p1', place: 0 });

    state = applyPlay(state, 'p2', combo(c('7', 'SPADE')));
    expect(state.phase).toBe('PLAYING');

    state = applyPlay(state, 'p3', combo(c('9', 'SPADE')));
    // Three are out; p4 is left holding cards and the round is over.
    expect(state.phase).toBe('ROUND_END');
    expect(state.finishOrder).toEqual(['p1', 'p2', 'p3']);
    expect(state.winnerOfRound).toBe('p1');
    expect(state.points).toEqual({ p1: 5, p2: 3, p3: 1, p4: 0 });
    // Only the outright winner counts as having won the round.
    expect(state.roundsWon).toEqual({ p1: 1 });
  });

  it('scores by placement, with no deduction for Twos left in hand', () => {
    const players = [
      { id: 'p1', hand: [] },
      { id: 'p2', hand: [] },
      { id: 'p3', hand: [] },
      { id: 'p4', hand: [c('2', 'HEART'), c('2', 'SPADE')] },
    ];
    expect(scoreRound(['p1', 'p2', 'p3'], players)).toEqual({ p1: 5, p2: 3, p3: 1, p4: 0 });
    expect(twosHeld(players[3]!.hand)).toBe(2);

    // The penalty exists as a pure function and simply is not applied. Passing
    // it explicitly is the only way to switch it on.
    expect(scoreRound(['p1', 'p2', 'p3'], players, { twoPenalty: 1 })).toMatchObject({ p4: -2 });
  });

  it('accumulates points across rounds without mutating the running total', () => {
    const total = { p1: 5, p2: 3 };
    const next = addScores(total, { p1: 1, p3: 5 });
    expect(next).toEqual({ p1: 6, p2: 3, p3: 5 });
    expect(total).toEqual({ p1: 5, p2: 3 });
  });

  it('awards 5/3/1/0 and nothing else', () => {
    expect(PLACEMENT_POINTS).toEqual([5, 3, 1, 0]);
  });
});

describe('a full round under the new rules', () => {
  /** Plays the first legal move; passes only when it has none. */
  function eager(id: string): Player {
    return {
      id,
      async getMove(_view, legalMoves, canPass) {
        if (legalMoves.length > 0) return { kind: 'PLAY', combo: legalMoves[0]! };
        if (canPass) return { kind: 'PASS' };
        throw new Error(`${id} is stuck`);
      },
    };
  }

  it('finishes, seats three players, and scores nine points in total', async () => {
    const seed = 'placement-seed';
    const state = createNewRound(IDS, createRng(seed), seed, 1, null, {});
    const final = await runRoundToCompletion(state, new Map(IDS.map((id) => [id, eager(id)])));

    expect(final.phase).toBe('ROUND_END');
    expect(final.finishOrder).toHaveLength(3);
    expect(new Set(final.finishOrder).size).toBe(3);
    for (const id of final.finishOrder) {
      expect(final.players.find((p) => p.id === id)!.hand).toHaveLength(0);
    }
    expect(Object.values(final.points).reduce((a, b) => a + b, 0)).toBe(9);
  });

  it('never lets a seat play again after it passed in the same trick', async () => {
    const seed = 'lockout-seed';
    const state = createNewRound(IDS, createRng(seed), seed, 1, null, {});
    const final = await runRoundToCompletion(state, new Map(IDS.map((id) => [id, eager(id)])));

    let passed = new Set<string>();
    for (const event of final.history) {
      if (event.type === 'TRICK_RESET') passed = new Set();
      else if (event.type === 'PLAYER_PASSED') passed.add(event.playerId);
      else if (event.type === 'CARDS_PLAYED') expect(passed.has(event.playerId)).toBe(false);
    }
  });
});

describe('the opening lead (9.1)', () => {
  it('offers every combo built around the opening card, not just the single', () => {
    // A hand whose lowest card is the 3 of Spades, with a pair and a straight
    // available around it.
    const hand = [c('3', 'SPADE'), c('3', 'HEART'), c('4', 'SPADE'), c('5', 'SPADE'), c('K', 'HEART')];
    const state = { ...stateWith([hand, [c('9', 'CLUB')], [c('9', 'HEART')], [c('9', 'DIAMOND')]]), firstPlayPending: true };

    const { legalMoves, canPass } = getTurnOptions(state);
    expect(canPass).toBe(false);

    const kinds = legalMoves.map((m) => `${m.type}:${m.cards.length}`);
    expect(kinds).toContain('SINGLE:1');
    expect(kinds).toContain('PAIR:2');
    expect(kinds).toContain('STRAIGHT:3');

    // Every offer contains the 3 of Spades; nothing that omits it is legal.
    for (const move of legalMoves) {
      expect(move.cards.some((x) => x.rank === '3' && x.suit === 'SPADE')).toBe(true);
    }
    // The King is unplayable here precisely because it cannot include the card.
    expect(legalMoves.some((m) => m.cards.some((x) => x.rank === 'K'))).toBe(false);
  });

  it('uses the starter’s own lowest card once round one is over', () => {
    const hand = [c('7', 'CLUB'), c('7', 'HEART'), c('K', 'SPADE')];
    const state = { ...stateWith([hand, [c('9', 'CLUB')], [c('9', 'HEART')], [c('9', 'DIAMOND')]]), firstPlayPending: true, openingCard: c('7', 'CLUB') };
    const { legalMoves } = getTurnOptions(state);
    for (const move of legalMoves) {
      expect(move.cards.some((x) => x.rank === '7' && x.suit === 'CLUB')).toBe(true);
    }
    expect(legalMoves.some((m) => m.type === 'PAIR')).toBe(true);
  });
});

describe('the deal (9.13)', () => {
  it('hands out piles in shuffle order rather than sorted', () => {
    // Sorted piles would mean every player opens with a tidy hand they did not
    // arrange. At least one pile out of a handful of deals must be out of
    // order — all four being sorted by chance is vanishingly unlikely.
    let sawUnsorted = false;
    for (let i = 0; i < 5 && !sawUnsorted; i++) {
      for (const pile of dealPiles(4, createRng(`shuffle-${i}`))) {
        const sorted = [...pile].sort((a, b) => cardValue(a) - cardValue(b));
        if (JSON.stringify(pile) !== JSON.stringify(sorted)) sawUnsorted = true;
      }
    }
    expect(sawUnsorted).toBe(true);
  });

  it('still deals thirteen distinct cards to each of four piles', () => {
    const piles = dealPiles(4, createRng('deal-integrity'));
    expect(piles).toHaveLength(4);
    const all = piles.flat();
    expect(all).toHaveLength(52);
    expect(new Set(all.map((x) => `${x.rank}_${x.suit}`)).size).toBe(52);
    for (const pile of piles) expect(pile).toHaveLength(13);
  });
});

describe('claims supplied from outside the engine', () => {
  const piles = () => dealPiles(4, createRng('claims-seed'));

  it('deals each player the pile they claimed', () => {
    const dealt = piles();
    const claims = [
      { playerId: 'p1', pileIndex: 2, pickIndex: 0 },
      { playerId: 'p2', pileIndex: 0, pickIndex: 1 },
      { playerId: 'p3', pileIndex: 3, pickIndex: 2 },
      { playerId: 'p4', pileIndex: 1, pickIndex: 3 },
    ];
    const { hands } = handsFromClaims(IDS, dealt, claims);
    expect(hands.get('p1')).toEqual(dealt[2]);
    expect(hands.get('p4')).toEqual(dealt[1]);
  });

  it('builds a round from pre-dealt piles and pre-made claims', () => {
    const dealt = piles();
    const claims = [
      { playerId: 'p3', pileIndex: 1, pickIndex: 0 },
      { playerId: 'p4', pileIndex: 0, pickIndex: 1 },
      { playerId: 'p1', pileIndex: 3, pickIndex: 2 },
      { playerId: 'p2', pileIndex: 2, pickIndex: 3 },
    ];
    const state = createNewRound(IDS, createRng('unused'), 'seed', 2, 'p3', {}, { piles: dealt, claims });

    expect(state.players.find((p) => p.id === 'p3')!.hand).toEqual(dealt[1]);
    expect(state.history[0]).toMatchObject({ type: 'PILE_CLAIMED', playerId: 'p3', pileIndex: 1, pickIndex: 0 });
    // 9.1 is unaffected by who picked: the previous winner still leads.
    expect(state.players[state.turnIndex]!.id).toBe('p3');
  });

  it('rejects claims that do not describe a clean deal', () => {
    const dealt = piles();
    const twice = [
      { playerId: 'p1', pileIndex: 0, pickIndex: 0 },
      { playerId: 'p2', pileIndex: 0, pickIndex: 1 },
      { playerId: 'p3', pileIndex: 2, pickIndex: 2 },
      { playerId: 'p4', pileIndex: 3, pickIndex: 3 },
    ];
    expect(() => handsFromClaims(IDS, dealt, twice)).toThrow(/claimed twice/);

    const short = [{ playerId: 'p1', pileIndex: 0, pickIndex: 0 }];
    expect(() => handsFromClaims(IDS, dealt, short)).toThrow(/Expected 4 pile claims/);

    const stranger = [
      { playerId: 'nobody', pileIndex: 0, pickIndex: 0 },
      { playerId: 'p2', pileIndex: 1, pickIndex: 1 },
      { playerId: 'p3', pileIndex: 2, pickIndex: 2 },
      { playerId: 'p4', pileIndex: 3, pickIndex: 3 },
    ];
    expect(() => handsFromClaims(IDS, dealt, stranger)).toThrow(/Unknown player id/);
  });
});
