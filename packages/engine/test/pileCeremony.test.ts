import { describe, expect, it } from 'vitest';
import { claimPiles, createDeck, dealPiles } from '../src/cards.js';
import { createRng } from '../src/rng.js';
import { createNewRound } from '../src/state.js';
import { cardId, cardValue, type Card, type PlayerId } from '../src/types.js';

const PLAYER_IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];

describe('dealPiles (9.13)', () => {
  it('splits the deck round-robin into four piles of thirteen', () => {
    const piles = dealPiles(4, createRng('deal-1'));
    expect(piles).toHaveLength(4);
    for (const pile of piles) expect(pile).toHaveLength(13);
  });

  it('deals every card exactly once', () => {
    const piles = dealPiles(4, createRng('deal-2'));
    const dealt = piles.flat().map(cardId).sort();
    expect(dealt).toHaveLength(52);
    expect(new Set(dealt).size).toBe(52);
    expect(dealt).toEqual(createDeck().map(cardId).sort());
  });

  it('is deterministic for a given seed, and different across seeds', () => {
    const ids = (piles: Card[][]) => piles.map((p) => p.map(cardId).join(','));
    expect(ids(dealPiles(4, createRng('same')))).toEqual(ids(dealPiles(4, createRng('same'))));
    expect(ids(dealPiles(4, createRng('a')))).not.toEqual(ids(dealPiles(4, createRng('b'))));
  });
});

describe('claimPiles (9.13)', () => {
  it('gives every player exactly one pile', () => {
    const piles = dealPiles(4, createRng('claim-1'));
    const { hands, claims } = claimPiles(PLAYER_IDS, piles, 'p1', createRng('claim-1'));
    expect(hands.size).toBe(4);
    for (const id of PLAYER_IDS) expect(hands.get(id)).toHaveLength(13);
    expect(new Set(claims.map((c) => c.pileIndex)).size).toBe(4);
  });

  it('picks in clockwise order starting from the first picker', () => {
    const piles = dealPiles(4, createRng('claim-2'));
    const { claims } = claimPiles(PLAYER_IDS, piles, 'p3', createRng('claim-2'));
    expect(claims.map((c) => c.playerId)).toEqual(['p3', 'p4', 'p1', 'p2']);
    expect(claims.map((c) => c.pickIndex)).toEqual([0, 1, 2, 3]);
  });

  it('rejects a first picker who is not at the table', () => {
    const piles = dealPiles(4, createRng('claim-3'));
    expect(() => claimPiles(PLAYER_IDS, piles, 'nobody', createRng('claim-3'))).toThrow(/Unknown first picker/);
  });

  it('hands out the actual dealt piles — no cards invented or lost', () => {
    const piles = dealPiles(4, createRng('claim-4'));
    const { hands } = claimPiles(PLAYER_IDS, piles, 'p1', createRng('claim-4'));
    const all = [...hands.values()].flat().map(cardId).sort();
    expect(all).toEqual(piles.flat().map(cardId).sort());
  });
});

describe('createNewRound — ceremony wiring', () => {
  it('logs one PILE_CLAIMED event per seat, before the hands are dealt', () => {
    const state = createNewRound(PLAYER_IDS, createRng('round-1'), 'round-1', 1, null, {});
    const claimed = state.history.filter((e) => e.type === 'PILE_CLAIMED');
    const dealt = state.history.filter((e) => e.type === 'HAND_DEALT');
    expect(claimed).toHaveLength(4);
    expect(dealt).toHaveLength(4);
    // Ceremony precedes the deal so the UI can animate the log in order.
    expect(state.history.indexOf(claimed[3]!)).toBeLessThan(state.history.indexOf(dealt[0]!));
  });

  it('carries no card data in the claim events — picks are blind (9.13)', () => {
    const state = createNewRound(PLAYER_IDS, createRng('round-2'), 'round-2', 1, null, {});
    for (const event of state.history) {
      if (event.type !== 'PILE_CLAIMED') continue;
      expect(Object.keys(event).sort()).toEqual(['pickIndex', 'pileIndex', 'playerId', 'type']);
    }
  });

  it("lets the previous round's winner pick first in rounds 2+", () => {
    const state = createNewRound(PLAYER_IDS, createRng('round-3'), 'round-3', 2, 'p3', {});
    const firstClaim = state.history.find((e) => e.type === 'PILE_CLAIMED');
    expect(firstClaim).toMatchObject({ playerId: 'p3', pickIndex: 0 });
  });

  it('picks a seeded-random first picker in round 1, independent of who starts', () => {
    // Across seeds the first picker varies — proving it is not hardcoded to seat 0.
    const pickers = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const seed = `picker-${i}`;
      const state = createNewRound(PLAYER_IDS, createRng(seed), seed, 1, null, {});
      const first = state.history.find((e) => e.type === 'PILE_CLAIMED');
      if (first?.type === 'PILE_CLAIMED') pickers.add(first.playerId);
    }
    expect(pickers.size).toBeGreaterThan(1);
  });

  it('keeps 9.1 intact — round 1 still starts with the 3 of Spades holder, not the first picker', () => {
    for (let i = 0; i < 25; i++) {
      const seed = `starter-${i}`;
      const state = createNewRound(PLAYER_IDS, createRng(seed), seed, 1, null, {});
      const starter = state.players[state.turnIndex]!;
      expect(starter.hand.some((c) => c.rank === '3' && c.suit === 'SPADE')).toBe(true);
      expect(state.openingCard).toEqual({ rank: '3', suit: 'SPADE' });
    }
  });

  it('replays identically from the same seed, ceremony included', () => {
    const build = () => createNewRound(PLAYER_IDS, createRng('replay'), 'replay', 1, null, {});
    expect(JSON.stringify(build().history)).toBe(JSON.stringify(build().history));
    expect(JSON.stringify(build().players)).toBe(JSON.stringify(build().players));
  });
});

describe('a round with a seat sitting out', () => {
  // Three players pick from four piles; the fourth pile is set aside unplayed.
  const piles = dealPiles(4, createRng('short-table'));
  const holder = piles.findIndex((pile) => pile.some((c) => c.rank === '3' && c.suit === 'SPADE'));

  it('keeps each player in their own seat', () => {
    const ids: PlayerId[] = ['p1', 'p2', 'p4'];
    const claims = ids.map((playerId, pickIndex) => ({ playerId, pileIndex: pickIndex, pickIndex }));
    const state = createNewRound(ids, createRng('r'), 'r', 1, null, {}, { piles, claims, seats: [0, 1, 3] });
    expect(state.players.map((p) => [p.id, p.seat])).toEqual([
      ['p1', 0],
      ['p2', 1],
      ['p4', 3],
    ]);
    for (const p of state.players) expect(p.hand).toHaveLength(13);
  });

  it('opens with the lowest card in play when the 3 of Spades is set aside', () => {
    const ids: PlayerId[] = ['p1', 'p2', 'p3'];
    const others = [0, 1, 2, 3].filter((i) => i !== holder);
    const claims = ids.map((playerId, pickIndex) => ({ playerId, pileIndex: others[pickIndex]!, pickIndex }));
    const state = createNewRound(ids, createRng('r'), 'r', 1, null, {}, { piles, claims });
    const starter = state.players[state.turnIndex]!;
    const lowestOf = (hand: Card[]) => Math.min(...hand.map(cardValue));
    const lowestInPlay = Math.min(...state.players.map((p) => lowestOf(p.hand)));
    expect(lowestOf(starter.hand)).toBe(lowestInPlay);
    expect(state.players.some((p) => p.hand.some((c) => c.rank === '3' && c.suit === 'SPADE'))).toBe(false);
    expect(state.firstPlayPending).toBe(true);
  });
});
