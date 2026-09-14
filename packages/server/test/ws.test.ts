import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { decodeServer, encodeClient, type ClientMessage, type ServerMessage } from '@big-two/protocol';
import { serve, type RunningServer } from '../src/ws.js';

/**
 * One test over a real socket.
 *
 * The table's behaviour is covered in memory, where it can be driven precisely;
 * what this adds is the only thing that file cannot prove — that the adapter
 * between a socket and the table is wired up at all. Two clients, one table, a
 * hand each, and neither able to see the other's.
 */

let server: RunningServer;

beforeAll(async () => {
  // Port 0: let the OS pick, so a busy machine does not fail the suite.
  server = await serve({ port: 0, turnTimeoutMs: 0, heartbeatMs: 60_000, paced: false });
});

afterAll(async () => {
  await server.close();
});

/**
 * A client that records everything it receives.
 *
 * Listeners are attached before the socket finishes opening, deliberately: the
 * server greets some connections the instant they arrive — a socket pointed at
 * a table that does not exist is told so and closed — and a client that waits
 * for `open` before it starts listening has already missed the answer.
 */
class Client {
  readonly received: ServerMessage[] = [];

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      const decoded = decodeServer(data.toString('utf8'));
      if (!decoded.ok) throw new Error('undecodable: ' + decoded.reason);
      this.received.push(decoded.message);
    });
  }

  static async open(port: number, code: string): Promise<Client> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/table/${code}`);
    const client = new Client(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return client;
  }

  send(message: ClientMessage): void {
    this.socket.send(encodeClient(message));
  }

  /** The most recent message of a type, if one has arrived. */
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    for (let i = this.received.length - 1; i >= 0; i--) {
      if (this.received[i]!.type === type) return this.received[i] as Extract<ServerMessage, { type: T }>;
    }
    return undefined;
  }

  async next<T extends ServerMessage['type']>(type: T, timeoutMs = 4_000): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.last(type);
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`no ${type} arrived`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  close(): void {
    this.socket.close();
  }
}

describe('over a real socket', () => {
  it('opens a table, seats two people, and deals each of them their own hand', async () => {
    const table = server.registry.create({ code: 'WSTEST', seed: 'ws-test' });
    expect(table.code).toBe('WSTEST');

    const a = await Client.open(server.port, 'WSTEST');
    const b = await Client.open(server.port, 'WSTEST');

    a.send({ type: 'JOIN', table: 'WSTEST', name: 'A' });
    const welcomeA = await a.next('WELCOME');
    b.send({ type: 'JOIN', table: 'WSTEST', name: 'B' });
    const welcomeB = await b.next('WELCOME');

    expect(welcomeA.you).not.toBe(welcomeB.you);
    expect(welcomeA.token).not.toBe(welcomeB.token);

    b.send({ type: 'READY' });
    // The host starts once the other player is ready — once the table has heard.
    const readyBy = Date.now() + 4_000;
    while (!a.last('SYNC')?.seats.find((s) => s.id === welcomeB.you)?.ready) {
      if (Date.now() > readyBy) throw new Error('ready never arrived');
      await new Promise((r) => setTimeout(r, 5));
    }
    a.send({ type: 'START' });

    // Answer the ceremony until both have a hand.
    const seatOf = new Map([
      [a, welcomeA.you],
      [b, welcomeB.you],
    ]);
    const deadline = Date.now() + 8_000;
    for (;;) {
      if (a.last('SYNC')?.view && b.last('SYNC')?.view) break;
      if (Date.now() > deadline) throw new Error('round never started');
      for (const client of [a, b]) {
        const sync = client.last('SYNC');
        if (sync?.ceremony.kind === 'picking' && sync.ceremony.picker === seatOf.get(client)) {
          client.send({ type: 'CLAIM_PILE', pileIndex: sync.ceremony.remaining[0]! });
        }
      }
      await new Promise((r) => setTimeout(r, 10));
    }

    const mine = a.last('SYNC')!.view!;
    const theirs = b.last('SYNC')!.view!;
    expect(mine.hand).toHaveLength(13);
    expect(theirs.hand).toHaveLength(13);

    // The guarantee, all the way through a socket this time.
    const serialised = JSON.stringify(a.last('SYNC'));
    for (const card of theirs.hand) {
      expect(serialised).not.toContain(`"rank":"${card.rank}","suit":"${card.suit}"`);
    }

    a.close();
    b.close();
  });

  it('refuses a socket pointed at a table that does not exist', async () => {
    const stray = await Client.open(server.port, 'NOSUCH');
    const closed = await stray.next('CLOSED');
    expect(closed.reason).toBe('No such table.');
    stray.close();
  });

  it('answers a malformed frame instead of ignoring it', async () => {
    const table = server.registry.create({ code: 'BADMSG', seed: 'bad' });
    expect(table.code).toBe('BADMSG');
    const client = await Client.open(server.port, 'BADMSG');

    // Straight to the socket, bypassing the encoder — which is exactly what a
    // hostile or broken client does.
    client.socket.send('{not json');
    const rejected = await client.next('REJECTED');
    expect(rejected.reason).toBe('Not valid JSON.');
    client.close();
  });
});

describe('socket limits', () => {
  it('refuses a socket from a site it was not told about', async () => {
    server.registry.create({ code: 'ORIGIN', seed: 'origin' });
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/table/ORIGIN`, { origin: 'http://somewhere-else.example' });
    const outcome = await new Promise<string>((resolve) => {
      socket.once('open', () => resolve('open'));
      socket.once('unexpected-response', () => resolve('refused'));
      socket.once('error', () => resolve('refused'));
    });
    expect(outcome).toBe('refused');
    socket.terminate();
  });

  it('cuts off a connection that floods the table', async () => {
    server.registry.create({ code: 'FLOODS', seed: 'flood' });
    const client = await Client.open(server.port, 'FLOODS');
    const closed = new Promise<void>((resolve) => client.socket.once('close', () => resolve()));
    for (let i = 0; i < 50; i++) client.send({ type: 'RESYNC' });
    await closed;
    expect(client.socket.readyState).toBe(WebSocket.CLOSED);
  });

  it('refuses a frame larger than any real message', async () => {
    server.registry.create({ code: 'BIGMSG', seed: 'big' });
    const client = await Client.open(server.port, 'BIGMSG');
    const closed = new Promise<number>((resolve) => client.socket.once('close', (code) => resolve(code)));
    client.socket.send('x'.repeat(64 * 1024));
    // 1009: message too big.
    expect(await closed).toBe(1009);
  });
});
