import { describe, expect, it } from 'vitest';
import { cardId, type Move, type PlayerId } from '@big-two/engine';
import { createGameSession, decideMatch, type GameSession, type SeatConfig, type SessionEvent } from '../src/index.js';

/**
 * Session tests.
 *
 * These are the ones that matter for multiplayer, because they check the
 * *boundary* rather than the rules — the rules already have ninety-four tests
 * of their own in the engine. What is new here is the claim that a consumer
 * cannot see or do more than it should, and that claim is only worth anything
 * if something asserts it.
 */

const SEAT_IDS: PlayerId[] = ['seat-1', 'seat-2', 'seat-3', 'seat-4'];

function seats(humans: PlayerId[] = []): SeatConfig[] {
  return SEAT_IDS.map((id, seat) => ({
    id,
    seat,
    occupant: humans.includes(id)
      ? { kind: 'human' as const }
      : { kind: 'cpu' as const, difficulty: 'medium' as const },
  }));
}

function session(opts: { humans?: PlayerId[]; seed?: string } = {}): GameSession {
  return createGameSession({ seats: seats(opts.humans ?? []), seed: opts.seed ?? 'session-test' });
}

/** Runs the table until it reports a round ended, or gives up. */
async function playOut(s: GameSession, timeoutMs = 5_000): Promise<SessionEvent[]> {
  const log: SessionEvent[] = [];
  s.subscribe((e) => log.push(e));
  s.start();
  const startedAt = Date.now();
  while (!log.some((e) => e.type === 'ROUND_ENDED')) {
    if (log.some((e) => e.type === 'FAILED')) throw new Error('session failed: ' + JSON.stringify(log.at(-1)));
    if (Date.now() - startedAt > timeoutMs) throw new Error('round did not finish');
    await new Promise((r) => setTimeout(r, 2));
  }
  return log;
}

describe('a session of four computers', () => {
  it('deals, plays a whole round, and reports a winner', async () => {
    const s = session();
    const log = await playOut(s);
    const ended = log.find((e) => e.type === 'ROUND_ENDED');

    expect(ended).toBeDefined();
    expect(SEAT_IDS).toContain((ended as { winner: PlayerId }).winner);
    s.dispose();
  });

  it('runs the ceremony before the round exists', async () => {
    const s = session();
    const log: SessionEvent[] = [];
    s.subscribe((e) => log.push(e));

    // No round, and therefore no view, until the piles have been claimed.
    expect(s.viewFor('seat-1')).toBeNull();
    s.start();

    const startedAt = Date.now();
    while (!log.some((e) => e.type === 'ROUND_STARTED')) {
      if (Date.now() - startedAt > 5_000) throw new Error('round never started');
      await new Promise((r) => setTimeout(r, 2));
    }

    const picks = log.filter((e) => e.type === 'CEREMONY' && e.ceremony.kind === 'picking');
    expect(picks).toHaveLength(SEAT_IDS.length);
    expect(s.viewFor('seat-1')).not.toBeNull();
    s.dispose();
  });

  it('replays the same round from the same seed', async () => {
    const hands = async () => {
      const s = session({ seed: 'reproducible' });
      const log: SessionEvent[] = [];
      s.subscribe((e) => log.push(e));
      s.start();
      const startedAt = Date.now();
      while (!log.some((e) => e.type === 'ROUND_STARTED')) {
        if (Date.now() - startedAt > 5_000) throw new Error('round never started');
        await new Promise((r) => setTimeout(r, 2));
      }
      const view = s.viewFor('seat-1')!;
      s.dispose();
      return view.hand.map(cardId);
    };

    expect(await hands()).toEqual(await hands());
  });
});

describe('rules that only show up across a whole round', () => {
  /*
   * These moved here from the client store, which used to run the game and so
   * was the only place they could be observed end to end. They are not store
   * behaviour and never were — they are what the table does over time, and the
   * table is this.
   */

  it('scores by placement 5/3/1/0 and accumulates across rounds', async () => {
    const s = session();
    const log = await playOut(s);
    const ended = log.find((e) => e.type === 'ROUND_ENDED') as { points: Record<PlayerId, number> };
    const finishOrder = s.viewFor('seat-1')!.finishOrder;

    // The round runs on until only one seat still holds cards, so three finish
    // and the fourth is left holding the bag.
    expect(finishOrder).toHaveLength(SEAT_IDS.length - 1);
    expect(new Set(finishOrder).size).toBe(SEAT_IDS.length - 1);

    expect(ended.points[finishOrder[0]!]).toBe(5);
    expect(ended.points[finishOrder[1]!]).toBe(3);
    expect(ended.points[finishOrder[2]!]).toBe(1);
    const last = SEAT_IDS.find((id) => !finishOrder.includes(id))!;
    expect(ended.points[last]).toBe(0);
    // No deduction for Twos left in hand — placement alone decides the score.
    expect(Object.values(ended.points).reduce((a, b) => a + b, 0)).toBe(9);

    // Round two, on the same session, adds to the same running total.
    const second: SessionEvent[] = [];
    s.subscribe((e) => second.push(e));
    s.startNextRound();
    const startedAt = Date.now();
    while (!second.some((e) => e.type === 'ROUND_ENDED')) {
      if (Date.now() - startedAt > 5_000) throw new Error('second round did not finish');
      await new Promise((r) => setTimeout(r, 2));
    }
    const after = second.find((e) => e.type === 'ROUND_ENDED') as { points: Record<PlayerId, number> };
    expect(Object.values(after.points).reduce((a, b) => a + b, 0)).toBe(18);
    s.dispose();
  });

  it('carries the winner into the next round as first picker (9.13) and leader (9.1)', async () => {
    const s = session();
    const log = await playOut(s);
    const winner = (log.find((e) => e.type === 'ROUND_ENDED') as { winner: PlayerId }).winner;

    const second: SessionEvent[] = [];
    s.subscribe((e) => second.push(e));
    s.startNextRound();
    const startedAt = Date.now();
    while (!second.some((e) => e.type === 'ROUND_STARTED')) {
      if (Date.now() - startedAt > 5_000) throw new Error('second round never started');
      await new Promise((r) => setTimeout(r, 2));
    }

    const history = s.viewFor(winner)!.history;
    // 9.13: the previous round's winner claims first. Every seat here is a
    // computer, so this is also the "a computer winner still picks first" case
    // — sitting at the table is what makes a pick interactive, not what
    // decides the order.
    expect(history.find((e) => e.type === 'PILE_CLAIMED')).toMatchObject({
      playerId: winner,
      pickIndex: 0,
    });
    // 9.1: and they lead. Read from the log rather than from `turnIndex`,
    // because the loop starts the instant the round is built and the index has
    // usually moved on by the time a test can look.
    expect(history.find((e) => e.type === 'CARDS_PLAYED')).toMatchObject({ playerId: winner });
    s.dispose();
  });

  it('puts people before computers on the opening round (9.13)', async () => {
    // Nobody has won anything yet, so there is no winner to defer to. A blind
    // pick decides nothing, which is exactly why the order can be spent on the
    // people at the table rather than on the seats.
    for (const seed of ['q-a', 'q-b', 'q-c', 'q-d', 'q-e', 'q-f']) {
      const s = createGameSession({ seats: seats(['seat-3']), seed });
      s.start();
      const startedAt = Date.now();
      for (;;) {
        const ceremony = s.ceremony();
        if (ceremony.kind === 'picking' && ceremony.picker !== null) {
          expect(ceremony.picker).toBe('seat-3');
          break;
        }
        if (Date.now() - startedAt > 5_000) throw new Error('ceremony never asked anybody');
        await new Promise((r) => setTimeout(r, 2));
      }
      s.dispose();
    }
  });

  it('does not build a round after being disposed mid-ceremony', async () => {
    const s = session({ humans: ['seat-1'] });
    const log: SessionEvent[] = [];
    s.subscribe((e) => log.push(e));
    s.start();

    const startedAt = Date.now();
    while (!(s.ceremony().kind === 'picking' && s.ceremony().kind !== 'idle')) {
      if (Date.now() - startedAt > 5_000) throw new Error('ceremony never started');
      await new Promise((r) => setTimeout(r, 2));
    }
    s.dispose();

    // The orphaned ceremony was parked on a pick that will never come. It must
    // not wake up later and deal a round into a table nobody is watching.
    await new Promise((r) => setTimeout(r, 200));
    expect(log.some((e) => e.type === 'ROUND_STARTED')).toBe(false);
    expect(s.viewFor('seat-1')).toBeNull();
  });
});

describe('what a seat is allowed to see', () => {
  it('never puts another seat’s cards in the view it hands out', async () => {
    // The whole redaction guarantee, asserted rather than assumed. A client
    // that cannot obtain the data cannot leak it, however it is written.
    const s = session();
    const log: SessionEvent[] = [];
    s.subscribe((e) => log.push(e));
    s.start();
    const startedAt = Date.now();
    while (!log.some((e) => e.type === 'ROUND_STARTED')) {
      if (Date.now() - startedAt > 5_000) throw new Error('round never started');
      await new Promise((r) => setTimeout(r, 2));
    }

    const mine = s.viewFor('seat-1')!;
    const theirs = s.viewFor('seat-2')!;

    // Their view of me carries a count and nothing else.
    const meFromTheirSide = theirs.opponents.find((o) => o.id === 'seat-1')!;
    expect(Object.keys(meFromTheirSide).sort()).toEqual(['cardCount', 'id', 'seat']);
    expect(meFromTheirSide.cardCount).toBe(mine.hand.length);

    // And nothing anywhere in my view mentions a card that is not mine.
    const myIds = new Set(mine.hand.map(cardId));
    const theirIds = new Set(theirs.hand.map(cardId));
    const serialised = JSON.stringify(mine);
    for (const id of theirIds) {
      if (myIds.has(id)) continue; // impossible with one deck, but be exact
      const [rank, suit] = id.split('_');
      expect(serialised).not.toContain('"rank":"' + rank + '","suit":"' + suit + '"');
    }
    s.dispose();
  });

  it('serialises to JSON, so a view can go down a wire unchanged', async () => {
    const s = session();
    const log: SessionEvent[] = [];
    s.subscribe((e) => log.push(e));
    s.start();
    const startedAt = Date.now();
    while (!log.some((e) => e.type === 'ROUND_STARTED')) {
      if (Date.now() - startedAt > 5_000) throw new Error('round never started');
      await new Promise((r) => setTimeout(r, 2));
    }

    const view = s.viewFor('seat-1')!;
    // No Map, no Set, no class instance — a round trip changes nothing.
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    s.dispose();
  });
});

describe('intents from a seat', () => {
  it('refuses a move from a seat whose turn it is not', async () => {
    const s = session({ humans: ['seat-1'] });
    const log: SessionEvent[] = [];
    s.subscribe((e) => log.push(e));
    s.start();

    // The ceremony blocks on our pick, so claim the first free pile.
    const startedAt = Date.now();
    for (;;) {
      const ceremony = s.ceremony();
      if (ceremony.kind === 'picking' && ceremony.picker === 'seat-1') {
        expect(s.claimPile('seat-1', ceremony.remaining[0]!).ok).toBe(true);
        break;
      }
      if (Date.now() - startedAt > 5_000) throw new Error('never asked us to pick');
      await new Promise((r) => setTimeout(r, 2));
    }

    const pass: Move = { kind: 'PASS' };
    // Seats that are not us cannot act through our connection...
    expect(s.submitMove('seat-2', pass)).toEqual({ ok: false, reason: 'It is not your turn.' });
    // ...and a seat that does not exist is not a seat.
    expect(s.submitMove('seat-9', pass).ok).toBe(false);
    s.dispose();
  });

  it('refuses a pile that is already taken, and a pick that is not yours', async () => {
    const s = session({ humans: ['seat-1'] });
    s.start();

    const startedAt = Date.now();
    for (;;) {
      const ceremony = s.ceremony();
      if (ceremony.kind === 'picking' && ceremony.picker === 'seat-1') break;
      if (Date.now() - startedAt > 5_000) throw new Error('never asked us to pick');
      await new Promise((r) => setTimeout(r, 2));
    }

    const ceremony = s.ceremony();
    if (ceremony.kind !== 'picking') throw new Error('expected a pick in progress');
    const taken = [0, 1, 2, 3].find((i) => !ceremony.remaining.includes(i));

    expect(s.claimPile('seat-2', ceremony.remaining[0]!).ok).toBe(false);
    if (taken !== undefined) expect(s.claimPile('seat-1', taken).ok).toBe(false);
    expect(s.claimPile('seat-1', ceremony.remaining[0]!).ok).toBe(true);
    s.dispose();
  });

  it('only offers a prompt to the seat actually on turn', async () => {
    const s = session();
    const log: SessionEvent[] = [];
    s.subscribe((e) => log.push(e));
    s.start();
    const startedAt = Date.now();
    while (!log.some((e) => e.type === 'ROUND_STARTED')) {
      if (Date.now() - startedAt > 5_000) throw new Error('round never started');
      await new Promise((r) => setTimeout(r, 2));
    }

    const prompts = SEAT_IDS.map((id) => s.promptFor(id)).filter(Boolean);
    // At most one seat is on turn at a time, and only that seat learns what it
    // may play — legal moves are derived from a hand, so handing them to
    // everybody would hand everybody a hand.
    expect(prompts.length).toBeLessThanOrEqual(1);
    s.dispose();
  });
});

describe('playing by naming cards', () => {
  /**
   * Drives a session with one person until it is that person's turn *and* they
   * have something they could play.
   *
   * The two are not the same thing. A turn with an empty legal set is a normal
   * turn — it is the one where your only option is to pass — so a helper that
   * stopped at the first prompt would hand these tests a seat with nothing to
   * name about a quarter of the time.
   */
  async function upToOurTurn(id: PlayerId = 'seat-1') {
    const s = session({ humans: [id] });
    s.start();
    const startedAt = Date.now();
    for (;;) {
      const ceremony = s.ceremony();
      if (ceremony.kind === 'picking' && ceremony.picker === id) {
        s.claimPile(id, ceremony.remaining[0]!);
      }
      const prompt = s.promptFor(id);
      if (prompt && prompt.legalMoves.length > 0) return s;
      if (prompt && prompt.canPass) s.submitMove(id, { kind: 'PASS' });
      if (Date.now() - startedAt > 10_000) throw new Error('never got a turn with a play in it');
      await new Promise((r) => setTimeout(r, 2));
    }
  }

  it('accepts cards that match one of this seat’s legal moves', async () => {
    const s = await upToOurTurn();
    const legal = s.promptFor('seat-1')!.legalMoves[0]!;

    // Named in a different order, to be sure it matches on identity rather
    // than on the caller having sorted them the way the engine did.
    const shuffled = [...legal.cards].reverse();
    expect(s.submitPlay('seat-1', shuffled)).toEqual({ ok: true });
    s.dispose();
  });

  it('refuses cards that are not one of them', async () => {
    const s = await upToOurTurn();
    const hand = s.viewFor('seat-1')!.hand;

    // A whole hand is never a combination, so this can never be legal.
    expect(s.submitPlay('seat-1', hand)).toEqual({
      ok: false,
      reason: 'Those cards are not a legal play.',
    });
    // Cards that are not even ours.
    expect(s.submitPlay('seat-1', [{ rank: '3', suit: 'SPADE' }]).ok).toBe(false);
    s.dispose();
  });

  it('decides for itself what the cards amount to', async () => {
    // The reason this entry point exists. The caller says *which cards*; the
    // combo that reaches the engine is one the engine itself produced, so
    // there is no step at which a client's opinion of the type is consulted.
    const s = await upToOurTurn();
    const prompt = s.promptFor('seat-1')!;
    const legal = prompt.legalMoves[0]!;

    expect(s.submitPlay('seat-1', legal.cards)).toEqual({ ok: true });

    // What landed on the table is the engine's combo, type and all. Found by
    // seat rather than by position: nothing is pacing these tests, so the
    // other three have usually answered before this line runs.
    await new Promise((r) => setTimeout(r, 20));
    const played = s
      .viewFor('seat-1')!
      .history.filter((e) => e.type === 'CARDS_PLAYED' && e.playerId === 'seat-1')
      .at(-1);
    expect(played).toMatchObject({ playerId: 'seat-1', combo: { type: legal.type } });
    s.dispose();
  });

  it('refuses a play from a seat that is not on turn', async () => {
    const s = await upToOurTurn();
    expect(s.submitPlay('seat-2', [{ rank: '3', suit: 'SPADE' }])).toEqual({
      ok: false,
      reason: 'It is not your turn.',
    });
    s.dispose();
  });
});

describe('handing a seat over', () => {
  it('lets a computer take a seat mid-round and finish it', async () => {
    // The disconnect story: a table of four does not stop because one
    // connection did. The seat is parked waiting on a person who is not
    // coming, so handing it to a computer has to unwind that turn and retake
    // it — not merely change who is asked *next* time.
    const s = session({ humans: ['seat-1'] });
    const log: SessionEvent[] = [];
    s.subscribe((e) => log.push(e));
    s.start();

    const startedAt = Date.now();
    for (;;) {
      const ceremony = s.ceremony();
      if (ceremony.kind === 'picking' && ceremony.picker === 'seat-1') {
        s.claimPile('seat-1', ceremony.remaining[0]!);
        break;
      }
      if (Date.now() - startedAt > 5_000) throw new Error('never asked us to pick');
      await new Promise((r) => setTimeout(r, 2));
    }

    // Wait until the table is genuinely blocked on us, then walk away.
    const blockedAt = Date.now();
    while (!s.promptFor('seat-1')) {
      if (Date.now() - blockedAt > 5_000) throw new Error('never became our turn');
      await new Promise((r) => setTimeout(r, 2));
    }
    s.setOccupant('seat-1', { kind: 'cpu', difficulty: 'easy' });

    const finishedAt = Date.now();
    while (!log.some((e) => e.type === 'ROUND_ENDED')) {
      if (log.some((e) => e.type === 'FAILED')) throw new Error('session failed after handover');
      if (Date.now() - finishedAt > 5_000) throw new Error('round did not finish after handover');
      await new Promise((r) => setTimeout(r, 2));
    }
    s.dispose();
  });
});

describe('disposal', () => {
  it('stops the loop and stays stopped', async () => {
    const s = session();
    const log: SessionEvent[] = [];
    s.subscribe((e) => log.push(e));
    s.start();
    await new Promise((r) => setTimeout(r, 30));

    s.dispose();
    const after = log.length;
    await new Promise((r) => setTimeout(r, 60));

    // Disposal drops the listeners, so nothing can arrive late and write into
    // a screen that has already moved on.
    expect(log.length).toBe(after);
    s.start();
    await new Promise((r) => setTimeout(r, 30));
    expect(log.length).toBe(after);
  });
});

describe('seeds', () => {
  it('deals the same four piles from the same seed, whoever is seated', async () => {
    // The promise a seed makes. Which pile you end up with still depends on a
    // blind pick; what must not depend on who is sitting down is the piles.
    const pilesFor = async (humans: PlayerId[]) => {
      const s = createGameSession({ seats: seats(humans), seed: 'SAME-SEED' });
      let piles: string[] | null = null;
      s.subscribe((e) => {
        // Read at the instant of dealing, before anybody has played a card.
        if (e.type === 'ROUND_STARTED') {
          piles = SEAT_IDS.map((id) => s.viewFor(id)!.hand.map(cardId).sort().join(',')).sort();
        }
      });
      s.start();
      const startedAt = Date.now();
      while (!piles) {
        const ceremony = s.ceremony();
        if (ceremony.kind === 'picking' && ceremony.picker && humans.includes(ceremony.picker)) {
          s.claimPile(ceremony.picker, ceremony.remaining[0]!);
        }
        if (Date.now() - startedAt > 5_000) throw new Error('never dealt');
        await new Promise((r) => setTimeout(r, 2));
      }
      s.dispose();
      return piles;
    };

    expect(await pilesFor([])).toEqual(await pilesFor(['seat-2', 'seat-3']));
  });

  it('can be changed before the first deal, and not after', () => {
    const s = session();
    expect(s.reseed('ABCD-2345')).toEqual({ ok: true });
    expect(s.seed()).toBe('ABCD-2345');

    s.start();
    expect(s.reseed('WXYZ-2345')).toEqual({ ok: false, reason: 'The seed is fixed once the first round is dealt.' });
    expect(s.seed()).toBe('ABCD-2345');
    s.dispose();
  });
});

describe('saving and resuming', () => {
  it('carries a round on from a save that went through JSON', async () => {
    const s = session({ seed: 'SAVE-TEST' });
    const log: SessionEvent[] = [];
    s.subscribe((e) => log.push(e));
    s.start();
    const startedAt = Date.now();
    while (log.filter((e) => e.type === 'TURN').length < 4) {
      if (Date.now() - startedAt > 5_000) throw new Error('never played');
      await new Promise((r) => setTimeout(r, 2));
    }
    const save = JSON.parse(JSON.stringify(s.save()));
    s.dispose();

    const resumed = createGameSession({ seats: seats(), seed: 'ignored', resume: save });
    // The table is back exactly as saved, before anything moves.
    expect(resumed.seed()).toBe('SAVE-TEST');
    expect(resumed.viewFor('seat-1')!.hand).toEqual(save.state.players[0].hand);

    const after = await playOut(resumed);
    expect(after.some((e) => e.type === 'ROUND_ENDED')).toBe(true);
    expect(resumed.viewFor('seat-1')!.history.length).toBeGreaterThan(save.state.history.length);
    resumed.dispose();
  });

  it('has nothing to save before the first deal', () => {
    expect(session().save()).toBeNull();
  });
});

describe('matches', () => {
  const ids: PlayerId[] = ['seat-1', 'seat-2', 'seat-3', 'seat-4'];
  const none = { 'seat-1': 0, 'seat-2': 0, 'seat-3': 0, 'seat-4': 0 };

  it('ends a points match when someone reaches the target, highest total first', () => {
    const points = { 'seat-1': 31, 'seat-2': 33, 'seat-3': 10, 'seat-4': 4 };
    expect(decideMatch({ kind: 'points', target: 30 }, { points, roundsWon: none, roundNumber: 8 }, ids)).toBe(
      'seat-2',
    );
    expect(decideMatch({ kind: 'points', target: 50 }, { points, roundsWon: none, roundNumber: 8 }, ids)).toBeNull();
  });

  it('ends a rounds match when the rounds are used up', () => {
    const points = { 'seat-1': 12, 'seat-2': 20, 'seat-3': 9, 'seat-4': 4 };
    expect(decideMatch({ kind: 'rounds', count: 5 }, { points, roundsWon: none, roundNumber: 4 }, ids)).toBeNull();
    expect(decideMatch({ kind: 'rounds', count: 5 }, { points, roundsWon: none, roundNumber: 5 }, ids)).toBe('seat-2');
  });

  it('breaks a points tie on rounds won, and plays on when that is level too', () => {
    const points = { 'seat-1': 30, 'seat-2': 30, 'seat-3': 1, 'seat-4': 0 };
    const rule = { kind: 'points' as const, target: 30 };
    expect(decideMatch(rule, { points, roundsWon: { ...none, 'seat-2': 3, 'seat-1': 2 }, roundNumber: 8 }, ids)).toBe(
      'seat-2',
    );
    expect(
      decideMatch(rule, { points, roundsWon: { ...none, 'seat-2': 2, 'seat-1': 2 }, roundNumber: 8 }, ids),
    ).toBeNull();
  });

  it('accepts only the lengths on the menu, and only before the deal', () => {
    const s = session();
    expect(s.match()).toEqual({ rule: { kind: 'points', target: 30 }, winner: null });
    expect(s.setMatch({ kind: 'points', target: 20 }).ok).toBe(false);
    expect(s.setMatch({ kind: 'rounds', count: 10 })).toEqual({ ok: true });
    s.start();
    expect(s.setMatch({ kind: 'rounds', count: 5 }).ok).toBe(false);
    expect(s.match().rule).toEqual({ kind: 'rounds', count: 10 });
    s.dispose();
  });

  it('decides a match, then starts a fresh one on a new deal', async () => {
    const s = createGameSession({ seats: seats(), seed: 'MATCH-END', match: { kind: 'rounds', count: 1 } });
    // Read at the instant each deal happens: an unpaced table of computers can
    // play a whole one-round match before a poll would notice it had started.
    const deals: { hand: string; winner: PlayerId | null; round: number; points: number[] }[] = [];
    s.subscribe((e) => {
      if (e.type !== 'ROUND_STARTED') return;
      const view = s.viewFor('seat-1')!;
      deals.push({
        hand: view.hand.map(cardId).sort().join(','),
        winner: s.match().winner,
        round: view.roundNumber,
        points: Object.values(view.points),
      });
    });

    const log = await playOut(s);
    const ended = log.find((e) => e.type === 'MATCH_ENDED');
    expect(ended).toBeDefined();
    expect(s.match().winner).toBe((ended as { winner: PlayerId }).winner);

    s.start();
    const startedAt = Date.now();
    while (deals.length < 2) {
      if (Date.now() - startedAt > 5_000) throw new Error('rematch never dealt');
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(deals[1]).toMatchObject({ winner: null, round: 1 });
    expect(deals[1]!.points.every((p) => p === 0)).toBe(true);
    // Same seed, new match: its own deal, not the first match's cards again.
    expect(deals[1]!.hand).not.toBe(deals[0]!.hand);
    s.dispose();
  });
});
