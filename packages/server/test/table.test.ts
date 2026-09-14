import { describe, expect, it } from 'vitest';
import type { Card } from '@big-two/engine';
import { randomSecret, verifyRound } from '@big-two/session';
import { decodeServer, encodeClient, decodeClient, type ClientMessage, type ServerMessage } from '@big-two/protocol';
import { Table, TableRegistry, type Connection } from '../src/index.js';

/**
 * Table tests.
 *
 * No sockets. A connection is anything that can be sent a string, so the whole
 * of the server's behaviour — joining, dropping, reclaiming a seat, being
 * played for when you stop answering — is exercised here in memory. That is
 * not a shortcut around testing the network; it is the point of having kept
 * the network out of this layer.
 */

/** A connection that remembers everything it was sent. */
class FakeConnection implements Connection {
  readonly sent: ServerMessage[] = [];
  closed: string | null = null;
  constructor(readonly id: string) {}

  send(raw: string): void {
    const decoded = decodeServer(raw);
    if (!decoded.ok) throw new Error('server sent something undecodable: ' + decoded.reason);
    this.sent.push(decoded.message);
  }

  close(reason?: string): void {
    this.closed = reason ?? 'closed';
  }

  /** The most recent message of a type, which is usually the one that matters. */
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      if (this.sent[i]!.type === type) return this.sent[i] as Extract<ServerMessage, { type: T }>;
    }
    return undefined;
  }
}

/** Sends a message the way a real client would — through encode and decode. */
function say(table: Table, connection: Connection, message: ClientMessage, id?: string): void {
  const decoded = decodeClient(encodeClient(message, id));
  if (!decoded.ok) throw new Error('test built an invalid message: ' + decoded.reason);
  table.handle(connection, decoded.envelope);
}

interface Clock {
  fire(): void;
  pending: number;
}

/** A timer that fires when a test says so, rather than when time passes. */
function fakeClock(): {
  clock: Clock;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
} {
  const timers = new Map<number, () => void>();
  let next = 1;
  return {
    clock: {
      get pending() {
        return timers.size;
      },
      fire() {
        const entries = [...timers.entries()];
        timers.clear();
        for (const [, fn] of entries) fn();
      },
    },
    setTimer: (fn) => {
      const handle = next++;
      timers.set(handle, fn);
      return handle;
    },
    clearTimer: (handle) => {
      timers.delete(handle as number);
    },
  };
}

function table(overrides: Partial<ConstructorParameters<typeof Table>[0]> = {}) {
  // Unpaced: these tests are the case where nobody is watching, so there is
  // nothing to spend wall clock making legible.
  return new Table({
    code: 'TESTAB',
    seed: 'server-test',
    turnTimeoutMs: 0,
    pickTimeoutMs: 0,
    readyCountdownMs: 0,
    rejoinGraceMs: 0,
    paced: false,
    ...overrides,
  });
}

/** Joins a connection and returns it. */
function join(t: Table, id: string, opts: { name?: string; token?: string } = {}): FakeConnection {
  const connection = new FakeConnection(id);
  say(t, connection, {
    type: 'JOIN',
    table: 'TESTAB',
    ...(opts.name ? { name: opts.name } : {}),
    ...(opts.token ? { token: opts.token } : {}),
  });
  return connection;
}

/**
 * Plays a round out by answering whatever the table asks of each connection.
 *
 * Acts at most once per `seq`. A client that replies to a picture it has
 * already replied to is answering a question that has since been asked and
 * answered, and the table rightly refuses it — which, in a loop, is a
 * deadlock rather than an error.
 */
async function drive(t: Table, connections: FakeConnection[], timeoutMs = 5_000): Promise<void> {
  const actedOn = new Map<FakeConnection, number>();
  const startedAt = Date.now();
  for (;;) {
    for (const connection of connections) {
      const sync = connection.last('SYNC');
      if (!sync || actedOn.get(connection) === sync.seq) continue;
      actedOn.set(connection, sync.seq);

      if (sync.ceremony.kind === 'picking' && sync.ceremony.picker === seatOf(connection, t)) {
        say(t, connection, { type: 'CLAIM_PILE', pileIndex: sync.ceremony.remaining[0]! });
      } else if (sync.prompt) {
        const move = sync.prompt.legalMoves[0];
        if (move) say(t, connection, { type: 'PLAY', move: { kind: 'PLAY', cards: move.cards } });
        else if (sync.prompt.canPass) say(t, connection, { type: 'PLAY', move: { kind: 'PASS' } });
      }
    }
    if (connections.some((c) => c.last('SYNC')?.view?.finishOrder.length === 3)) return;
    if (Date.now() - startedAt > timeoutMs) throw new Error('round did not finish');
    await new Promise((r) => setTimeout(r, 2));
  }
}

function seatOf(connection: FakeConnection, _t: Table): string | undefined {
  return connection.last('WELCOME')?.you;
}

describe('sitting down', () => {
  it('gives a joiner a seat, a token, and its own picture of the table', () => {
    const t = table();
    const a = join(t, 'a', { name: 'Jas' });

    const welcome = a.last('WELCOME')!;
    expect(welcome.you).toBe('seat-1');
    expect(welcome.table).toBe('TESTAB');
    expect(welcome.token).toBeTruthy();

    const sync = a.last('SYNC')!;
    expect(sync.seats.find((s) => s.id === 'seat-1')).toMatchObject({
      name: 'Jas',
      occupant: 'human',
      connected: true,
    });
    // The other three are chairs nobody has sat in, not chairs somebody left.
    expect(sync.seats.filter((s) => s.occupant === 'cpu')).toHaveLength(3);
  });

  it('seats four people and then says it is full', () => {
    const t = table();
    const people = ['a', 'b', 'c', 'd'].map((id) => join(t, id));
    expect(people.map((p) => p.last('WELCOME')!.you)).toEqual(['seat-1', 'seat-2', 'seat-3', 'seat-4']);

    const late = join(t, 'e');
    expect(late.last('WELCOME')).toBeUndefined();
    expect(late.last('REJECTED')).toMatchObject({ reason: 'This table is full.' });
  });

  it('refuses anything before a join, and says which intent failed', () => {
    const t = table();
    const stranger = new FakeConnection('stranger');
    say(t, stranger, { type: 'PLAY', move: { kind: 'PASS' } }, 'req-1');

    expect(stranger.last('REJECTED')).toMatchObject({ id: 'req-1', reason: 'Join the table first.' });
  });
});

describe('what each seat is sent', () => {
  it('sends every seat a different picture, holding only its own cards', async () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');
    say(t, b, { type: 'READY' });
    say(t, a, { type: 'START' });

    const startedAt = Date.now();
    while (!a.last('SYNC')?.view) {
      if (Date.now() - startedAt > 5_000) throw new Error('round never started');
      // The ceremony blocks on whoever it asks, so answer for both.
      for (const connection of [a, b]) {
        const sync = connection.last('SYNC');
        if (sync?.ceremony.kind === 'picking' && sync.ceremony.picker === seatOf(connection, t)) {
          say(t, connection, { type: 'CLAIM_PILE', pileIndex: sync.ceremony.remaining[0]! });
        }
      }
      await new Promise((r) => setTimeout(r, 2));
    }

    const mine = a.last('SYNC')!.view!;
    const theirs = b.last('SYNC')!.view!;
    expect(mine.selfId).not.toBe(theirs.selfId);

    // The guarantee, over the wire this time: nothing in the message sent to
    // one seat names a card belonging to another.
    const serialised = JSON.stringify(a.last('SYNC'));
    for (const card of theirs.hand) {
      expect(serialised).not.toContain(`"rank":"${card.rank}","suit":"${card.suit}"`);
    }
    // And it does carry every card of my own.
    for (const card of mine.hand) {
      expect(serialised).toContain(`"rank":"${card.rank}","suit":"${card.suit}"`);
    }
  });

  it('offers a prompt only to the seat on turn', async () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');
    say(t, b, { type: 'READY' });
    say(t, a, { type: 'START' });

    const startedAt = Date.now();
    while (!a.last('SYNC')?.view) {
      for (const connection of [a, b]) {
        const sync = connection.last('SYNC');
        if (sync?.ceremony.kind === 'picking' && sync.ceremony.picker === seatOf(connection, t)) {
          say(t, connection, { type: 'CLAIM_PILE', pileIndex: sync.ceremony.remaining[0]! });
        }
      }
      if (Date.now() - startedAt > 5_000) throw new Error('round never started');
      await new Promise((r) => setTimeout(r, 2));
    }

    const prompts = [a, b].filter((c) => c.last('SYNC')!.prompt !== null);
    expect(prompts.length).toBeLessThanOrEqual(1);
  });

  it('answers a resync with the whole picture and no replayed events', () => {
    const t = table();
    const a = join(t, 'a');
    const before = a.sent.length;

    say(t, a, { type: 'RESYNC' });
    const sync = a.last('SYNC')!;
    expect(a.sent.length).toBe(before + 1);
    // A resync is a complete answer, not a replay: the events ride along for
    // animation only, and there is nothing to animate about catching up.
    expect(sync.events).toEqual([]);
    expect(sync.seats).toHaveLength(4);
  });
});

describe('dropping out and coming back', () => {
  it('hands a dropped seat to a computer and keeps it marked as theirs', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');

    t.disconnect(a);

    const seats = b.last('SYNC')!.seats;
    // `away`, not `cpu`: somebody is expected back in that chair, and the
    // difference is the difference between waiting for them and not.
    expect(seats.find((s) => s.id === 'seat-1')).toMatchObject({ occupant: 'away', connected: false });
    expect(seats.find((s) => s.id === 'seat-3')).toMatchObject({ occupant: 'cpu' });
  });

  it('gives the same seat back to whoever holds its token', () => {
    const t = table();
    const a = join(t, 'a', { name: 'Jas' });
    const token = a.last('WELCOME')!.token;
    t.disconnect(a);

    // Somebody else joins in the meantime and must not be given that chair.
    const other = join(t, 'other');
    expect(other.last('WELCOME')!.you).toBe('seat-2');

    const back = join(t, 'a-again', { token });
    expect(back.last('WELCOME')!.you).toBe('seat-1');
    expect(back.last('SYNC')!.seats.find((s) => s.id === 'seat-1')).toMatchObject({
      occupant: 'human',
      connected: true,
      name: 'Jas',
    });
  });

  it('closes the older tab when a seat is opened twice', () => {
    const t = table();
    const a = join(t, 'a');
    const token = a.last('WELCOME')!.token;

    const second = join(t, 'a-second-tab', { token });

    expect(a.closed).toBe('Seat taken over');
    expect(a.last('CLOSED')).toMatchObject({ reason: 'This seat was opened somewhere else.' });
    expect(second.last('WELCOME')!.you).toBe('seat-1');
  });
});

describe('the turn clock', () => {
  it('plays for somebody who has stopped answering', async () => {
    const { clock, setTimer, clearTimer } = fakeClock();
    const t = table({ turnTimeoutMs: 30_000, setTimer, clearTimer });
    const a = join(t, 'a');
    say(t, a, { type: 'START' });

    // Answer the ceremony, then go quiet.
    const startedAt = Date.now();
    while (!a.last('SYNC')?.view) {
      const sync = a.last('SYNC');
      if (sync?.ceremony.kind === 'picking' && sync.ceremony.picker === seatOf(a, t)) {
        say(t, a, { type: 'CLAIM_PILE', pileIndex: sync.ceremony.remaining[0]! });
      }
      if (Date.now() - startedAt > 5_000) throw new Error('round never started');
      await new Promise((r) => setTimeout(r, 2));
    }

    // Wait for the table to be genuinely waiting on us.
    const blockedAt = Date.now();
    while (!a.last('SYNC')!.prompt) {
      if (Date.now() - blockedAt > 5_000) throw new Error('never became our turn');
      await new Promise((r) => setTimeout(r, 2));
    }

    expect(clock.pending).toBeGreaterThan(0);
    const before = a.last('SYNC')!.view!.history.length;
    clock.fire();
    await new Promise((r) => setTimeout(r, 40));

    // The log grew, so the table moved on without us. Asserted that way rather
    // than by looking at whose turn it is: with three computers answering
    // instantly, the turn can easily come back round to us before this line
    // runs, and "it is my turn again" is not the same as "nothing happened".
    expect(a.last('SYNC')!.view!.history.length).toBeGreaterThan(before);
  });

  it('does not put a clock on a seat nobody is sitting in', () => {
    const { clock, setTimer, clearTimer } = fakeClock();
    const t = table({ turnTimeoutMs: 30_000, setTimer, clearTimer });
    // Nobody has joined, so every seat is a computer and none of them can
    // possibly be late.
    expect(clock.pending).toBe(0);
    t.close();
  });
});

describe('the clock, as clients see it', () => {
  it('says nothing while no clock is running', () => {
    const t = table({ turnTimeoutMs: 0 });
    const a = join(t, 'a');
    // Before a round, and on a table with the timer off, there is nobody to
    // keep waiting.
    expect(a.last('SYNC')!.clock).toBeNull();
  });

  it('reports a duration rather than a deadline, counting down', async () => {
    let now = 10_000;
    const { setTimer, clearTimer } = fakeClock();
    const t = table({ turnTimeoutMs: 30_000, setTimer, clearTimer, now: () => now });
    const a = join(t, 'a');
    say(t, a, { type: 'START' });

    const startedAt = Date.now();
    while (!a.last('SYNC')?.prompt) {
      const sync = a.last('SYNC');
      if (sync?.ceremony.kind === 'picking' && sync.ceremony.picker === seatOf(a, t)) {
        say(t, a, { type: 'CLAIM_PILE', pileIndex: sync.ceremony.remaining[0]! });
      }
      if (Date.now() - startedAt > 5_000) throw new Error('never became our turn');
      await new Promise((r) => setTimeout(r, 2));
    }

    const first = a.last('SYNC')!.clock!;
    expect(first.playerId).toBe('seat-1');
    expect(first.totalMs).toBe(30_000);
    expect(first.remainingMs).toBe(30_000);

    // Time passes; the next snapshot says how much is actually left. A
    // deadline would have required the client's clock to agree with this one.
    now += 12_000;
    say(t, a, { type: 'RESYNC' });
    expect(a.last('SYNC')!.clock!.remainingMs).toBe(18_000);

    // And it never goes negative, however late the next snapshot is.
    now += 60_000;
    say(t, a, { type: 'RESYNC' });
    expect(a.last('SYNC')!.clock!.remainingMs).toBe(0);
    t.close();
  });
});

describe('pacing computer seats', () => {
  it('paces them at the table, not in the clients', async () => {
    /*
     * The bug this pins: the server built its session with no pacer at all, so
     * every computer answered the instant it was asked and a whole trick went
     * round before anybody saw it happen. Pacing cannot live in the clients —
     * four people have to watch the same table at the same time, and none of
     * them gets to set the pace for the others.
     */
    const asked: string[] = [];
    const t = table({
      paced: true,
      pacer: async (kind) => {
        asked.push(kind);
      },
    });
    const a = join(t, 'a');
    say(t, a, { type: 'START' });

    const startedAt = Date.now();
    while (!a.last('SYNC')?.view) {
      const sync = a.last('SYNC');
      if (sync?.ceremony.kind === 'picking' && sync.ceremony.picker === seatOf(a, t)) {
        say(t, a, { type: 'CLAIM_PILE', pileIndex: sync.ceremony.remaining[0]! });
      }
      if (Date.now() - startedAt > 5_000) throw new Error('round never started');
      await new Promise((r) => setTimeout(r, 2));
    }
    await new Promise((r) => setTimeout(r, 50));

    // The three computer seats deliberated over their piles, and then over
    // their moves.
    expect(asked.filter((k) => k === 'pick').length).toBe(3);
    expect(asked.some((k) => k === 'play' || k === 'pass')).toBe(true);
    t.close();
  });
});

describe('naming', () => {
  it('lets a seat be named after joining, not only at the door', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');
    // Somebody arriving through a shared link never sees a form first, so the
    // name has to be settable from inside the room.
    expect(a.last('SYNC')!.seats[0]).toMatchObject({ name: 'Seat 1' });

    say(t, a, { type: 'SET_NAME', name: 'Alice' });

    expect(a.last('SYNC')!.seats[0]).toMatchObject({ name: 'Alice' });
    // And everybody else is told, because a name is for the other people.
    expect(b.last('SYNC')!.seats[0]).toMatchObject({ name: 'Alice' });
  });

  it('will not let one seat rename another', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');

    say(t, a, { type: 'SET_NAME', name: 'Alice' });

    // The name lands on the seat the connection holds, so there is no way to
    // address somebody else's — it is not a field on the message.
    expect(b.last('SYNC')!.seats[1]).toMatchObject({ name: 'Seat 2' });
  });
});

describe('starting a round', () => {
  it('lets the host start once every other connected person is ready', async () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');

    say(t, a, { type: 'START' }, 'req-early');
    expect(a.last('REJECTED')).toMatchObject({ id: 'req-early', reason: 'Waiting for one player to ready up.' });

    // Readiness alone deals nothing: it is the host who starts.
    say(t, b, { type: 'READY' });
    await new Promise((r) => setTimeout(r, 20));
    expect(a.last('SYNC')!.ceremony.kind).toBe('idle');

    say(t, a, { type: 'START' });
    await new Promise((r) => setTimeout(r, 20));
    // Computers in the other two chairs are not consulted — they would always
    // say yes, and a table where the machines outvote the people is not a vote.
    expect(a.last('SYNC')!.ceremony.kind).toBe('picking');
  });
});

describe('the registry', () => {
  it('hands out codes that are easy to read aloud', () => {
    const registry = new TableRegistry();
    const first = registry.create();
    expect(first.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    // No I, O, 0 or 1 — a code gets typed by hand from a link somebody read out.
    expect(first.code).not.toMatch(/[IO01]/);
    expect(registry.get(first.code.toLowerCase())).toBe(first);
  });

  it('keeps an empty table around long enough to reload into', () => {
    let now = 1_000;
    const registry = new TableRegistry({ emptyTableGraceMs: 60_000, now: () => now });
    const created = registry.create({ code: 'KEEPME', seed: 's' });
    const a = join(created, 'a');

    created.disconnect(a);
    registry.sweep();
    expect(registry.size).toBe(1);

    // "Everybody reloaded at once" and "everybody went home" look identical for
    // the first few seconds, and the first one should not lose the game.
    now += 30_000;
    registry.sweep();
    expect(registry.size).toBe(1);

    now += 31_000;
    registry.sweep();
    expect(registry.size).toBe(0);
  });

  it('does not sweep a table somebody is still sitting at', () => {
    let now = 1_000;
    const registry = new TableRegistry({ emptyTableGraceMs: 1, now: () => now });
    const created = registry.create({ code: 'BUSYYY', seed: 's' });
    join(created, 'a');

    now += 10_000;
    registry.sweep();
    expect(registry.size).toBe(1);
  });
});

describe('a whole round, over the wire', () => {
  it('plays to a finish with two people connected', async () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');
    say(t, b, { type: 'READY' });
    say(t, a, { type: 'START' });

    await drive(t, [a, b]);

    const finished = a.last('SYNC')!.view!.finishOrder;
    expect(finished).toHaveLength(3);
    // Both clients agree about who went out and in what order — they are
    // reading the same table, not two simulations that happen to match.
    expect(b.last('SYNC')!.view!.finishOrder).toEqual(finished);
  });
});

describe('choosing a seat at a shared table', () => {
  it('moves a person to an empty seat, and frees the one they left', () => {
    const t = table();
    const a = join(t, 'a', { name: 'Alice' });
    const token = a.last('WELCOME')!.token;

    say(t, a, { type: 'TAKE_SEAT', seat: 2 });

    // Told where they are now, with the same token, so a reconnection finds
    // the new seat rather than the old one.
    expect(a.last('WELCOME')).toMatchObject({ you: 'seat-3', token });
    const seats = a.last('SYNC')!.seats;
    expect(seats[2]).toMatchObject({ name: 'Alice', occupant: 'human', connected: true });
    expect(seats[0]).toMatchObject({ name: 'Seat 1', occupant: 'cpu', connected: false });
  });

  it('will not take a seat somebody else holds, even while they are away', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');
    t.disconnect(b);

    say(t, a, { type: 'TAKE_SEAT', seat: 1 }, 'req-seat');

    expect(a.last('REJECTED')).toMatchObject({ id: 'req-seat', reason: 'That seat is taken.' });
    expect(a.last('WELCOME')!.you).toBe('seat-1');
  });

  it('fixes seats once the first round is dealt', () => {
    const t = table();
    const a = join(t, 'a');
    say(t, a, { type: 'START' });

    say(t, a, { type: 'TAKE_SEAT', seat: 3 });

    expect(a.last('REJECTED')).toMatchObject({ reason: 'Seats are fixed once the first round is dealt.' });
    t.close();
  });

  it('keeps the move when the person reconnects', () => {
    const t = table();
    const a = join(t, 'a');
    const token = a.last('WELCOME')!.token;
    say(t, a, { type: 'TAKE_SEAT', seat: 3 });
    t.disconnect(a);

    const back = join(t, 'a-again', { token });
    expect(back.last('WELCOME')!.you).toBe('seat-4');
  });
});

describe('table settings before the first deal', () => {
  it('opens a table with a seed in the same format as playing alone', () => {
    const created = new TableRegistry().create();
    const a = join(created, 'a');
    expect(a.last('SYNC')!.seed).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    created.close();
  });

  it('shares a changed seed with everybody', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');

    say(t, a, { type: 'SET_SEED', seed: 'ABCD-2345' });

    expect(b.last('SYNC')!.seed).toBe('ABCD-2345');
  });

  it('fixes the seed once dealt', () => {
    const t = table();
    const a = join(t, 'a');
    say(t, a, { type: 'START' });

    say(t, a, { type: 'SET_SEED', seed: 'WXYZ-2345' });

    expect(a.last('REJECTED')).toMatchObject({ reason: 'The seed is fixed once the first round is dealt.' });
    t.close();
  });

  it('sets a computer seat difficulty for everybody', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');

    say(t, a, { type: 'SET_DIFFICULTY', seat: 3, difficulty: 'hard' });

    expect(b.last('SYNC')!.seats[3]).toMatchObject({ occupant: 'cpu', difficulty: 'hard' });
  });

  it('will not set difficulty on a seat a person holds', () => {
    const t = table();
    const a = join(t, 'a');
    join(t, 'b');

    say(t, a, { type: 'SET_DIFFICULTY', seat: 1, difficulty: 'easy' }, 'req-diff');

    expect(a.last('REJECTED')).toMatchObject({ id: 'req-diff', reason: 'That seat belongs to a person.' });
  });
});

describe('the host', () => {
  it('is whoever sat down first, and passes on when they leave', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');
    expect(
      b
        .last('SYNC')!
        .seats.filter((s) => s.host)
        .map((s) => s.id),
    ).toEqual(['seat-1']);

    t.disconnect(a);
    expect(
      b
        .last('SYNC')!
        .seats.filter((s) => s.host)
        .map((s) => s.id),
    ).toEqual(['seat-2']);
  });

  it('can remove somebody before the deal, freeing the seat and voiding their token', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b', { name: 'Bea' });
    const oldToken = b.last('WELCOME')!.token;

    say(t, a, { type: 'KICK', seat: 1 });

    expect(b.last('CLOSED')).toMatchObject({ reason: 'You were removed from the table.' });
    expect(b.closed).toBeTruthy();
    expect(a.last('SYNC')!.seats[1]).toMatchObject({ name: 'Seat 2', occupant: 'cpu', connected: false });

    // The link still works — as somebody new, not as Bea reclaiming her chair.
    const back = join(t, 'b2', { token: oldToken });
    expect(back.last('WELCOME')!.token).not.toBe(oldToken);
  });

  it('is the only one who can remove people', () => {
    const t = table();
    join(t, 'a');
    const b = join(t, 'b');

    say(t, b, { type: 'KICK', seat: 0 }, 'req-kick');

    expect(b.last('REJECTED')).toMatchObject({ id: 'req-kick', reason: 'Only the host can remove people.' });
  });

  it('cannot remove anybody once the first round is dealt', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');
    say(t, b, { type: 'READY' });
    say(t, a, { type: 'START' });

    say(t, a, { type: 'KICK', seat: 1 }, 'req-late');

    expect(a.last('REJECTED')).toMatchObject({
      id: 'req-late',
      reason: 'People can only be removed before the first deal.',
    });
    expect(b.closed).toBeNull();
  });
});

describe('between rounds', () => {
  it('deals after the countdown, with a computer in for whoever was not ready, until they come back', async () => {
    const { clock, setTimer, clearTimer } = fakeClock();
    const t = table({ setTimer, clearTimer, readyCountdownMs: 30_000 });
    const a = join(t, 'a');
    const b = join(t, 'b');
    say(t, b, { type: 'READY' });
    say(t, a, { type: 'START' });
    await drive(t, [a, b]);
    await new Promise((r) => setTimeout(r, 30));

    // One says yes; the other has wandered off.
    say(t, a, { type: 'READY' });
    const waiting = b.last('SYNC')!;
    expect(waiting.nextRound).toMatchObject({ totalMs: 30_000 });
    expect(waiting.seats[0]).toMatchObject({ ready: true });
    expect(waiting.seats[1]).toMatchObject({ ready: false, standIn: false });

    clock.fire();
    await new Promise((r) => setTimeout(r, 30));

    const dealt = b.last('SYNC')!;
    expect(dealt.nextRound).toBeNull();
    expect(dealt.seats[1]).toMatchObject({ standIn: true, connected: true });
    // A computer is deciding for them, so they are asked nothing.
    expect(dealt.prompt).toBeNull();
    say(t, b, { type: 'PLAY', move: { kind: 'PASS' } }, 'req-standin');
    expect(b.last('REJECTED')).toMatchObject({ id: 'req-standin' });

    say(t, b, { type: 'READY' });
    expect(b.last('SYNC')!.seats[1]).toMatchObject({ standIn: false });
  });

  it('lets a player cancel ready, stopping the countdown once nobody is left ready', async () => {
    const { clock, setTimer, clearTimer } = fakeClock();
    const t = table({ setTimer, clearTimer, readyCountdownMs: 30_000 });
    const a = join(t, 'a');
    const b = join(t, 'b');
    say(t, b, { type: 'READY' });
    say(t, a, { type: 'START' });
    await drive(t, [a, b]);
    await new Promise((r) => setTimeout(r, 30));

    say(t, a, { type: 'READY' });
    expect(b.last('SYNC')!.nextRound).toMatchObject({ totalMs: 30_000 });

    say(t, a, { type: 'UNREADY' });
    const cancelled = b.last('SYNC')!;
    expect(cancelled.seats[0]).toMatchObject({ ready: false });
    expect(cancelled.nextRound).toBeNull();
    expect(clock.pending).toBe(0);

    // Readying again starts the count from the top.
    say(t, a, { type: 'READY' });
    expect(b.last('SYNC')!.nextRound).toMatchObject({ totalMs: 30_000 });
    expect(clock.pending).toBe(1);
  });

  it('keeps counting down when somebody else is still ready', async () => {
    const { clock, setTimer, clearTimer } = fakeClock();
    const t = table({ setTimer, clearTimer, readyCountdownMs: 30_000 });
    const a = join(t, 'a');
    const b = join(t, 'b');
    const c = join(t, 'c');
    say(t, b, { type: 'READY' });
    say(t, c, { type: 'READY' });
    say(t, a, { type: 'START' });
    await drive(t, [a, b, c]);
    await new Promise((r) => setTimeout(r, 30));

    say(t, a, { type: 'READY' });
    say(t, b, { type: 'READY' });
    say(t, b, { type: 'UNREADY' });

    const sync = c.last('SYNC')!;
    expect(sync.seats[0]).toMatchObject({ ready: true });
    expect(sync.seats[1]).toMatchObject({ ready: false });
    expect(sync.nextRound).not.toBeNull();
    expect(clock.pending).toBe(1);
  });

  it('does not count down in the lobby, where people are still arriving', () => {
    const { clock, setTimer, clearTimer } = fakeClock();
    const t = table({ setTimer, clearTimer, readyCountdownMs: 30_000 });
    const a = join(t, 'a');
    join(t, 'b');

    say(t, a, { type: 'READY' });

    expect(a.last('SYNC')!.nextRound).toBeNull();
    expect(clock.pending).toBe(0);
  });
});

describe('leaving', () => {
  it('frees the seat at once when somebody leaves the lobby', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');
    const token = b.last('WELCOME')!.token;

    say(t, b, { type: 'LEAVE' });

    expect(a.last('SYNC')!.seats[1]).toMatchObject({ occupant: 'cpu', name: 'Seat 2' });
    // Their token no longer names a chair; coming back is arriving fresh.
    const back = join(t, 'b2', { token });
    expect(back.last('WELCOME')!.token).not.toBe(token);
  });

  it('holds the seat for a while when somebody leaves mid-match, then frees it', () => {
    const { clock, setTimer, clearTimer } = fakeClock();
    const t = table({ setTimer, clearTimer, rejoinGraceMs: 120_000 });
    const a = join(t, 'a');
    const b = join(t, 'b');
    const token = b.last('WELCOME')!.token;
    say(t, b, { type: 'READY' });
    say(t, a, { type: 'START' });

    say(t, b, { type: 'LEAVE' });
    expect(a.last('SYNC')!.seats[1]).toMatchObject({ occupant: 'away' });

    // Back in time: the same chair, the same token.
    const back = join(t, 'b-again', { token });
    expect(back.last('WELCOME')).toMatchObject({ you: 'seat-2', token });

    t.disconnect(back);
    clock.fire();
    expect(a.last('SYNC')!.seats[1]).toMatchObject({ occupant: 'cpu', connected: false });

    // Freed: the next arrival takes it, and the old token reclaims nothing.
    const late = join(t, 'late', { token });
    expect(late.last('WELCOME')!.you).toBe('seat-2');
    expect(late.last('WELCOME')!.token).not.toBe(token);
  });
});

describe('match length', () => {
  it('starts at first to 30 points, and only the host can change it', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');
    expect(a.last('SYNC')!.match).toEqual({ rule: { kind: 'points', target: 30 }, winner: null });

    say(t, b, { type: 'SET_MATCH', rule: { kind: 'rounds', count: 5 } }, 'req-match');
    expect(b.last('REJECTED')).toMatchObject({ id: 'req-match', reason: 'Only the host can change the match length.' });

    say(t, a, { type: 'SET_MATCH', rule: { kind: 'rounds', count: 10 } });
    expect(b.last('SYNC')!.match.rule).toEqual({ kind: 'rounds', count: 10 });
  });

  it('fixes the match length once the first round is dealt', () => {
    const t = table();
    const a = join(t, 'a');
    say(t, a, { type: 'START' });

    say(t, a, { type: 'SET_MATCH', rule: { kind: 'points', target: 15 } }, 'req-late');

    expect(a.last('REJECTED')).toMatchObject({
      id: 'req-late',
      reason: 'The match length is fixed once the first round is dealt.',
    });
  });
});

describe('computer difficulty', () => {
  it("is the host's to set", () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');

    say(t, b, { type: 'SET_DIFFICULTY', seat: 2, difficulty: 'hard' }, 'req-diff-guest');
    expect(b.last('REJECTED')).toMatchObject({
      id: 'req-diff-guest',
      reason: 'Only the host can change computer difficulty.',
    });
    expect(a.last('SYNC')!.seats[2]).toMatchObject({ difficulty: 'medium' });

    say(t, a, { type: 'SET_DIFFICULTY', seat: 2, difficulty: 'hard' });
    expect(b.last('SYNC')!.seats[2]).toMatchObject({ difficulty: 'hard' });
  });
});

describe('a table hosted in a browser', () => {
  it("deals from everyone's shuffle and hands out a round that checks out", async () => {
    const t = table({ fairDeal: true });
    const people = [join(t, 'a'), join(t, 'b')];
    const sealed = new Map<FakeConnection, { commit: string; share: string }>();
    const picked = new Map<FakeConnection, number>();
    const acted = new Map<FakeConnection, number>();
    say(t, people[1]!, { type: 'READY' });
    say(t, people[0]!, { type: 'START' });

    const startedAt = Date.now();
    for (;;) {
      for (const person of people) {
        const commit = person.last('DEAL_COMMIT');
        if (commit && !sealed.has(person)) {
          const share = randomSecret();
          sealed.set(person, { commit: commit.commit, share });
          say(t, person, { type: 'DEAL_SHARE', round: commit.round, share });
        }
        const sync = person.last('SYNC');
        if (!sync || acted.get(person) === sync.seq) continue;
        acted.set(person, sync.seq);
        const you = person.last('WELCOME')?.you;
        if (sync.ceremony.kind === 'picking' && sync.ceremony.picker === you) {
          const pile = sync.ceremony.remaining[0]!;
          picked.set(person, pile);
          say(t, person, { type: 'CLAIM_PILE', pileIndex: pile });
        } else if (sync.prompt) {
          const move = sync.prompt.legalMoves[0];
          if (move) say(t, person, { type: 'PLAY', move: { kind: 'PLAY', cards: move.cards } });
          else if (sync.prompt.canPass) say(t, person, { type: 'PLAY', move: { kind: 'PASS' } });
        }
      }
      if (people.every((person) => person.last('ROUND_AUDIT'))) break;
      if (Date.now() - startedAt > 8_000) throw new Error('no round audit arrived');
      await new Promise((r) => setTimeout(r, 2));
    }

    for (const person of people) {
      const audit = person.last('ROUND_AUDIT')!.audit;
      const firstView = person.sent.find((m) => m.type === 'SYNC' && m.view !== null);
      const hand: Card[] | null = firstView?.type === 'SYNC' ? firstView.view!.hand : null;
      const final = person.last('SYNC')!.view!;
      const witness = {
        you: person.last('WELCOME')!.you,
        ...sealed.get(person)!,
        pile: picked.get(person) ?? null,
        hand,
        history: final.history,
        points: final.points,
      };
      expect(await verifyRound(audit, witness)).toEqual({ ok: true });
      expect(Object.keys(audit.shares).sort()).toEqual(['seat-1', 'seat-2']);
      // A host that swapped its secret afterwards is caught.
      expect((await verifyRound({ ...audit, hostSecret: randomSecret() }, witness)).ok).toBe(false);
    }
    t.close();
  });
});

describe('readying up before the first deal', () => {
  it('lets a player ready up and back down, and only the host start', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');

    say(t, b, { type: 'START' }, 'req-guest');
    expect(b.last('REJECTED')).toMatchObject({ id: 'req-guest', reason: 'Only the host can start the game.' });

    say(t, b, { type: 'READY' });
    expect(a.last('SYNC')!.seats[1]).toMatchObject({ ready: true });
    say(t, b, { type: 'UNREADY' });
    expect(a.last('SYNC')!.seats[1]).toMatchObject({ ready: false });

    say(t, a, { type: 'START' }, 'req-host');
    expect(a.last('REJECTED')).toMatchObject({ id: 'req-host', reason: 'Waiting for one player to ready up.' });
  });

  it('asks everyone to ready up again when the host changes a setting', () => {
    const t = table();
    const a = join(t, 'a');
    const b = join(t, 'b');
    say(t, b, { type: 'READY' });

    say(t, a, { type: 'SET_MATCH', rule: { kind: 'rounds', count: 5 } });

    expect(b.last('SYNC')!.seats[1]).toMatchObject({ ready: false });
  });

  it('lets a host alone start straight away', () => {
    const t = table();
    const a = join(t, 'a');
    say(t, a, { type: 'START' });
    expect(a.last('SYNC')!.ceremony.kind).toBe('picking');
    t.close();
  });
});

describe('reopening a lobby', () => {
  it('brings back seats, names and settings, held for their people', () => {
    const t = table();
    const a = join(t, 'a', { name: 'Ana' });
    const b = join(t, 'b', { name: 'Bo' });
    say(t, a, { type: 'SET_MATCH', rule: { kind: 'rounds', count: 10 } });
    say(t, a, { type: 'SET_DIFFICULTY', seat: 3, difficulty: 'hard' });
    const snapshot = t.lobbySnapshot()!;
    const aWelcome = a.last('WELCOME')!;
    const bWelcome = b.last('WELCOME')!;
    t.close();

    const reopened = table({ restore: snapshot });
    // Held, not free: somebody new is shown to the next empty chair.
    const c = join(reopened, 'c');
    expect(c.last('WELCOME')!.you).not.toBe(aWelcome.you);
    expect(c.last('WELCOME')!.you).not.toBe(bWelcome.you);
    expect(c.last('SYNC')!.seats[0]).toMatchObject({ name: 'Ana', occupant: 'away' });

    // A guest can be back before the host; the host is still the host.
    const b2 = join(reopened, 'b2', { token: bWelcome.token });
    const a2 = join(reopened, 'a2', { token: aWelcome.token });
    expect(b2.last('WELCOME')!.you).toBe(bWelcome.you);
    expect(a2.last('WELCOME')!.you).toBe(aWelcome.you);
    const sync = a2.last('SYNC')!;
    expect(sync.seats[0]).toMatchObject({ name: 'Ana', host: true, connected: true });
    expect(sync.seats[1]).toMatchObject({ name: 'Bo', host: false, connected: true });
    expect(sync.seats[3]).toMatchObject({ difficulty: 'hard' });
    expect(sync.match.rule).toEqual({ kind: 'rounds', count: 10 });
    reopened.close();
  });

  it('has no lobby to offer once the game has started', () => {
    const t = table();
    const a = join(t, 'a');
    expect(t.lobbySnapshot()).not.toBeNull();
    say(t, a, { type: 'START' });
    expect(t.lobbySnapshot()).toBeNull();
    t.close();
  });

  it('reports each change, so a host can keep its copy current', () => {
    let changes = 0;
    const t = table({ onChange: () => (changes += 1) });
    join(t, 'a');
    expect(changes).toBeGreaterThan(0);
    t.close();
  });
});

describe('the pile pick clock', () => {
  it('times a person picking a pile, and picks for them when time runs out', async () => {
    const { clock, setTimer, clearTimer } = fakeClock();
    const t = table({ setTimer, clearTimer, pickTimeoutMs: 15_000 });
    const a = join(t, 'a');
    say(t, a, { type: 'START' });

    const startedAt = Date.now();
    for (;;) {
      const ceremony = a.last('SYNC')?.ceremony;
      if (ceremony?.kind === 'picking' && ceremony.picker === 'seat-1') break;
      if (Date.now() - startedAt > 3_000) throw new Error('never asked to pick');
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(a.last('SYNC')!.clock).toMatchObject({ playerId: 'seat-1', totalMs: 15_000, remainingMs: 15_000 });

    clock.fire();

    const firedAt = Date.now();
    while (!a.last('SYNC')?.view) {
      if (Date.now() - firedAt > 3_000) throw new Error('the pick was never made');
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(a.last('SYNC')!.view!.history.some((e) => e.type === 'PILE_CLAIMED' && e.playerId === 'seat-1')).toBe(true);
    t.close();
  });
});
