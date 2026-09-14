import { beforeEach, describe, expect, it } from 'vitest';
import { cardId } from '@big-two/engine';
import { DEFAULT_HUMAN_SEAT, SEAT_IDS, useGameStore } from '../src/store/gameStore.js';

/**
 * Store tests.
 *
 * The store no longer runs the game — a `GameSession` does, and that package
 * has its own suite covering the round, the ceremony, scoring and the
 * redaction boundary. What is left here is what the store is actually for:
 * choosing seats, holding this seat's view of the table, and turning clicks
 * into intents.
 *
 * Several tests that used to live here moved to `@big-two/session` rather than
 * being deleted — placement scoring, the winner carrying into the next round,
 * the opening pick order, and abandoning a table mid-ceremony. They were never
 * store behaviour; the store was just the only place they could be observed
 * when it was the thing driving the game.
 */

const store = useGameStore;

/** Answers the ceremony if it is waiting on us, so a deal can complete. */
function autoPick(): void {
  const { ceremony, choosePile } = store.getState();
  if (ceremony.kind === 'picking' && ceremony.interactive) choosePile(ceremony.remaining[0]!);
}

async function waitForDeal(timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    autoPick();
    if (store.getState().view) return;
    if (Date.now() - startedAt > timeoutMs) throw new Error('Round was never dealt');
    await new Promise((r) => setTimeout(r, 5));
  }
}

function freshTable() {
  store.getState().leaveTable();
  store.getState().setPaced(false);
  store.getState().setSeed('store-test');
}

describe('seats when playing alone', () => {
  beforeEach(freshTable);

  it('seats every id exactly once, with the human at the bottom', () => {
    // No seat choice alone: nothing depends on which chair you take when the
    // other three are computers, so the store simply seats you.
    const seats = store.getState().seats;
    expect(seats.map((s) => s.id).sort()).toEqual([...SEAT_IDS].sort());
    expect(seats.filter((s) => s.occupant === 'human')).toHaveLength(1);
    expect(seats.find((s) => s.occupant === 'human')!.seat).toBe(DEFAULT_HUMAN_SEAT);
  });

  it('sets each computer seat difficulty independently', () => {
    store.getState().setSeatDifficulty(1, 'hard');
    store.getState().setSeatDifficulty(2, 'easy');
    const seats = store.getState().seats;
    expect(seats.find((s) => s.seat === 1)!.difficulty).toBe('hard');
    expect(seats.find((s) => s.seat === 2)!.difficulty).toBe('easy');
  });
});

describe('the view the store holds', () => {
  beforeEach(freshTable);

  it('holds this seat’s view, and only this seat’s hand', async () => {
    store.getState().startMatch();
    await waitForDeal();

    const view = store.getState().view!;
    expect(view.selfId).toBe(SEAT_IDS[DEFAULT_HUMAN_SEAT]);
    expect(view.hand).toHaveLength(13);

    // The redaction, from the client's side: the other three seats are counts.
    expect(view.opponents).toHaveLength(3);
    for (const opponent of view.opponents) {
      expect(Object.keys(opponent).sort()).toEqual(['cardCount', 'id', 'seat']);
    }
  });

  it('arranges the hand as dealt rather than sorted', async () => {
    store.getState().startMatch();
    await waitForDeal();

    const { view, handOrder } = store.getState();
    // You arrange your own hand. A deal that hands you a tidy one has taken
    // the first decision of the round away from you; sorting is one click.
    expect(handOrder).toEqual(view!.hand.map(cardId));
  });

  it('reports whose turn it is, and offers moves only when it is ours', async () => {
    store.getState().startMatch();
    await waitForDeal();

    const { awaitingHuman, legalMoves, canPass } = store.getState();
    // Being offered anything at all is a statement that the table is waiting on
    // this seat. On our turn that is a play or a pass — a hand that cannot beat
    // the standing combo is offered only the pass, which this test used to
    // miss until a different deal happened to produce one.
    if (awaitingHuman) expect(legalMoves.length > 0 || canPass).toBe(true);
    else expect({ legalMoves, canPass }).toEqual({ legalMoves: [], canPass: false });
  });
});

describe('selection', () => {
  beforeEach(freshTable);

  it('toggles a card in and out, keeping the order it was picked in', async () => {
    store.getState().startMatch();
    await waitForDeal();
    const hand = store.getState().view!.hand;

    store.getState().toggleCard(hand[3]!);
    store.getState().toggleCard(hand[0]!);
    expect(store.getState().selection.map(cardId)).toEqual([cardId(hand[3]!), cardId(hand[0]!)]);

    store.getState().toggleCard(hand[3]!);
    expect(store.getState().selection.map(cardId)).toEqual([cardId(hand[0]!)]);

    store.getState().clearSelection();
    expect(store.getState().selection).toEqual([]);
  });

  it('refuses to play cards that are not a legal move', async () => {
    store.getState().startMatch();
    await waitForDeal();
    const hand = store.getState().view!.hand;

    // Thirteen cards are not a combination, so this can never be legal — and
    // the store must not send it whether or not it is our turn.
    expect(store.getState().playCards(hand)).toBe(false);
  });
});

describe('leaving', () => {
  beforeEach(freshTable);

  it('returns to the menu and drops the table', async () => {
    store.getState().startMatch();
    await waitForDeal();
    expect(store.getState().view).not.toBeNull();

    store.getState().leaveTable();
    expect(store.getState().screen).toBe('menu');
    expect(store.getState().view).toBeNull();
    expect(store.getState().ceremony.kind).toBe('idle');

    // The abandoned session must not keep playing into a screen that has gone.
    await new Promise((r) => setTimeout(r, 150));
    expect(store.getState().view).toBeNull();
    expect(store.getState().error).toBeNull();
  });
});
