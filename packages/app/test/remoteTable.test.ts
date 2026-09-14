import { describe, expect, it } from 'vitest';
import { decodeClient, encodeServer, type ClientMessage, type ServerMessage } from '@big-two/protocol';
import { createRemoteTable, type SocketLike } from '../src/table/remoteTable.js';
import type { TableSnapshot } from '../src/table/types.js';

/**
 * Remote table tests.
 *
 * Sending messages is four lines and barely worth testing. What is worth
 * testing is everything around a connection that is not there: what a client
 * does while it is down, what it says when it comes back, and whether it is
 * still the same person to the table when it does.
 */

/** A socket the test drives by hand. */
class FakeSocket implements SocketLike {
  readonly sent: ClientMessage[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  send(data: string): void {
    const decoded = decodeClient(data);
    if (!decoded.ok) throw new Error('client sent something invalid: ' + decoded.reason);
    this.sent.push(decoded.envelope.message);
  }

  close(): void {
    this.closed = true;
  }

  /** Pretend the server said something. */
  deliver(message: ServerMessage): void {
    this.onmessage?.({ data: encodeServer(message) });
  }

  open(): void {
    this.onopen?.();
  }

  drop(): void {
    this.onclose?.();
  }

  last<T extends ClientMessage['type']>(type: T): Extract<ClientMessage, { type: T }> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      if (this.sent[i]!.type === type) return this.sent[i] as Extract<ClientMessage, { type: T }>;
    }
    return undefined;
  }
}

/** Builds a client whose sockets and timers the test controls. */
function harness(options: { token?: string } = {}) {
  const sockets: FakeSocket[] = [];
  const timers: (() => void)[] = [];
  const snapshots: TableSnapshot[] = [];
  const tokens: string[] = [];

  const client = createRemoteTable({
    url: 'ws://test/table/ABCDEF',
    table: 'ABCDEF',
    name: 'Jas',
    ...(options.token ? { token: options.token } : {}),
    onToken: (t) => tokens.push(t),
    openSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimer: () => {},
  });

  client.subscribe((snapshot) => snapshots.push(snapshot));

  return {
    client,
    sockets,
    tokens,
    snapshots,
    /** The socket currently in use. */
    get socket() {
      return sockets[sockets.length - 1]!;
    },
    /** Fire every scheduled retry. */
    tick() {
      const pending = timers.splice(0, timers.length);
      for (const fn of pending) fn();
    },
  };
}

const SYNC: ServerMessage = {
  type: 'SYNC',
  seq: 4,
  view: null,
  prompt: null,
  ceremony: { kind: 'picking', claims: [], remaining: [0, 1, 2, 3], picker: 'seat-1' },
  seats: [],
  events: [],
  clock: null,
  seed: 'TEST-SEED',
  nextRound: null,
  match: { rule: { kind: 'points', target: 30 }, winner: null },
};

describe('connecting', () => {
  it('joins with a name as soon as the socket opens', () => {
    const h = harness();
    expect(h.client.snapshot().status).toBe('connecting');

    h.socket.open();

    expect(h.client.snapshot().status).toBe('connected');
    expect(h.socket.last('JOIN')).toEqual({ type: 'JOIN', table: 'ABCDEF', name: 'Jas' });
  });

  it('remembers the seat token the table issues', () => {
    const h = harness();
    h.socket.open();
    h.socket.deliver({ type: 'WELCOME', you: 'seat-2', table: 'ABCDEF', token: 'tok-1', version: 1 });

    expect(h.tokens).toEqual(['tok-1']);
    expect(h.client.snapshot().you).toBe('seat-2');
  });

  it('takes a snapshot at face value rather than patching what it had', () => {
    const h = harness();
    h.socket.open();
    h.socket.deliver(SYNC);

    const snapshot = h.client.snapshot();
    expect(snapshot.seq).toBe(4);
    expect(snapshot.ceremony).toEqual(SYNC.type === 'SYNC' ? SYNC.ceremony : null);
    expect(snapshot.pending).toBe(false);
  });
});

describe('losing the connection', () => {
  it('reports itself as reconnecting and stops offering a turn', () => {
    const h = harness();
    h.socket.open();
    h.socket.deliver({
      ...SYNC,
      prompt: { playerId: 'seat-1', legalMoves: [], canPass: true, constraint: { kind: 'NONE' } },
    } as ServerMessage);
    expect(h.client.snapshot().prompt).not.toBeNull();

    h.socket.drop();

    const snapshot = h.client.snapshot();
    expect(snapshot.status).toBe('reconnecting');
    // The prompt goes immediately. Leaving it up invites somebody to play into
    // a socket that is not there and watch nothing happen.
    expect(snapshot.prompt).toBeNull();
  });

  it('comes back as the same person, not a new arrival', () => {
    const h = harness();
    h.socket.open();
    h.socket.deliver({ type: 'WELCOME', you: 'seat-2', table: 'ABCDEF', token: 'tok-1', version: 1 });
    h.socket.drop();

    h.tick();
    expect(h.sockets).toHaveLength(2);
    h.socket.open();

    // The token goes back up, so the table returns the same chair instead of
    // seating us again — which at four seats would mean finding it full.
    expect(h.socket.last('JOIN')).toEqual({ type: 'JOIN', table: 'ABCDEF', name: 'Jas', token: 'tok-1' });
  });

  it('joins with a token it was given before it ever connected', () => {
    const h = harness({ token: 'from-storage' });
    h.socket.open();
    expect(h.socket.last('JOIN')).toMatchObject({ token: 'from-storage' });
  });

  it('holds only the most recent intent while it is down', () => {
    const h = harness();
    h.socket.open();
    h.socket.drop();

    h.client.pass();
    h.client.claimPile(2);

    h.tick();
    h.socket.open();

    // One intent is replayed, and it is the last one. A queue of moves sent
    // after a reconnection would be moves made against a table that has since
    // moved on — worse than losing them, and the turn clock exists so that
    // nobody is owed a move they did not manage to send.
    const replayed = h.socket.sent.filter((m) => m.type !== 'JOIN');
    expect(replayed).toEqual([{ type: 'CLAIM_PILE', pileIndex: 2 }]);
  });

  it('gives up when the table says it is over', () => {
    const h = harness();
    h.socket.open();
    h.socket.deliver({ type: 'CLOSED', reason: 'Everybody left.' });

    expect(h.client.snapshot().status).toBe('closed');
    expect(h.client.snapshot().error).toBe('Everybody left.');

    h.tick();
    // No retry: the server did not fail, it finished. Reconnecting into a
    // table that has closed just produces the same answer more often.
    expect(h.sockets).toHaveLength(1);
  });
});

describe('sending intents', () => {
  it('marks a play as pending until the table answers', () => {
    const h = harness();
    h.socket.open();

    h.client.play([{ rank: 'A', suit: 'SPADE' }]);
    expect(h.client.snapshot().pending).toBe(true);
    expect(h.socket.last('PLAY')).toEqual({
      type: 'PLAY',
      move: { kind: 'PLAY', cards: [{ rank: 'A', suit: 'SPADE' }] },
    });

    h.socket.deliver(SYNC);
    expect(h.client.snapshot().pending).toBe(false);
  });

  it('surfaces a refusal and stops waiting', () => {
    const h = harness();
    h.socket.open();
    h.client.pass();

    h.socket.deliver({ type: 'REJECTED', reason: 'It is not your turn.' });

    expect(h.client.snapshot()).toMatchObject({ pending: false, error: 'It is not your turn.' });
  });

  it('says goodbye before closing', () => {
    const h = harness();
    h.socket.open();
    h.client.dispose();

    expect(h.socket.last('LEAVE')).toEqual({ type: 'LEAVE' });
    expect(h.socket.closed).toBe(true);
  });
});

describe('a fair table', () => {
  it('answers a sealed deal with a random share of its own', () => {
    const h = harness();
    h.socket.open();
    h.socket.deliver({ type: 'DEAL_COMMIT', round: 1, commit: 'f'.repeat(64) });

    const share = h.socket.last('DEAL_SHARE');
    expect(share).toMatchObject({ type: 'DEAL_SHARE', round: 1 });
    expect(share!.share).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not claim to have checked a round it never saw sealed', () => {
    const h = harness();
    h.socket.open();
    h.socket.deliver({
      type: 'ROUND_AUDIT',
      audit: {
        roundNumber: 1,
        commit: 'x',
        hostSecret: 'y',
        shares: {},
        dealSeed: 'z',
        seats: [],
        previousWinner: null,
        roundsWon: {},
        points: null,
        claims: [],
        history: [],
      },
    });
    expect(h.client.snapshot().fairness).toEqual({ round: 1, status: 'unchecked' });
  });
});

describe('the lobby', () => {
  it('readies up, backs down, and starts', () => {
    const h = harness();
    h.socket.open();
    h.client.ready();
    h.client.unready();
    h.client.start();
    expect(h.socket.sent.filter((m) => m.type !== 'JOIN').map((m) => m.type)).toEqual(['READY', 'UNREADY', 'START']);
  });
});
