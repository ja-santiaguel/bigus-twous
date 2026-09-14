import Peer, { type DataConnection } from 'peerjs';
import { encodeServer } from '@big-two/protocol';
import type { LobbySnapshot } from '@big-two/server/table';
import { makeSeed } from '@big-two/session';
import type { SocketLike } from '../table/remoteTable.js';
import { clearHostedLobby, saveHostedLobby } from './lobbyRestore.js';
import { HOST_AWAY, KEEPALIVE, KEEPALIVE_MS, SILENCE_MS, peerIdFor, peerOptions } from './peerSocket.js';

/**
 * Hosting a table in this browser.
 *
 * The table itself runs in a module worker (`hostWorker.ts`): the same `Table`
 * a table server runs, holding the game and every hand. This page never holds
 * the game state — it relays each guest's messages to the worker and the
 * worker's replies back, and plays at the table through a connection of its
 * own like everybody else. Seeing another hand from here means going into the
 * worker with developer tools, not glancing at the page; the fairness check
 * (9.18) is what stops a host changing the game.
 *
 * Until the first deal the page also keeps a copy of the lobby, so a reload
 * reopens the same table rather than stranding everyone in it (9.18).
 */

export interface Hosting {
  code: string;
  /** This page's own seat at the table, through the same protocol as a guest's. */
  openLocalSocket(): SocketLike;
  /** Close the table for everyone and stop hosting. */
  close(): void;
}

type FromWorker =
  | { type: 'send'; id: string; raw: string }
  | { type: 'drop'; id: string }
  | { type: 'lobby'; snapshot: LobbySnapshot | null }
  | { type: 'closed' };

const LOCAL = 'host';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HOST_LEFT = 'The host left, so this table has closed.';

/**
 * How long a reopened page keeps asking for its old code. The broker can hold
 * it for a few seconds after the page that had it went away.
 */
const RECLAIM_MS = 15_000;

function makeCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function describe(error: unknown): string {
  const type = (error as { type?: string } | null)?.type;
  if (type === 'browser-incompatible') return 'This browser cannot host a table.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error') {
    return 'The connection service could not be reached. Check your connection and try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

const isTaken = (error: unknown) => (error as { type?: string } | null)?.type === 'unavailable-id';

async function openPeer(id: string): Promise<Peer> {
  const options = await peerOptions();
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, options);
    const onError = (error: unknown) => {
      peer.destroy();
      reject(error);
    };
    peer.once('open', () => {
      peer.off('error', onError);
      resolve(peer);
    });
    peer.once('error', onError);
  });
}

/** A fresh code. Six characters from 32 rarely clash; the broker refusing the id is how one shows up. */
async function openNewPeer(): Promise<{ peer: Peer; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    try {
      return { peer: await openPeer(peerIdFor(code)), code };
    } catch (error) {
      if (!isTaken(error)) throw new Error(describe(error));
    }
  }
  throw new Error('No free table code was found. Try again.');
}

/** The code this tab's lobby had before it reloaded. */
async function reclaimPeer(code: string): Promise<Peer> {
  const giveUpAt = Date.now() + RECLAIM_MS;
  for (;;) {
    try {
      return await openPeer(peerIdFor(code));
    } catch (error) {
      if (!isTaken(error)) throw new Error(describe(error));
      if (Date.now() >= giveUpAt) throw new Error('Its code is still in use.');
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

export async function startHosting(restore?: LobbySnapshot): Promise<Hosting> {
  const { peer: host, code } = restore
    ? { peer: await reclaimPeer(restore.code), code: restore.code }
    : await openNewPeer();

  const worker = new Worker(new URL('./hostWorker.ts', import.meta.url), { type: 'module' });
  worker.postMessage({ type: 'init', code, seed: restore?.seed ?? makeSeed(), ...(restore ? { restore } : {}) });

  /** Each guest's line, and when it was last heard from. */
  const channels = new Map<string, { line: DataConnection; lastHeard: number }>();
  let local: SocketLike | null = null;
  let nextId = 1;
  let closed = false;
  /** The lobby as the table last described it; null once the game has started. */
  let lobby: LobbySnapshot | null = null;

  const drop = (id: string) => {
    const channel = channels.get(id);
    if (!channel) return;
    channels.delete(id);
    channel.line.close();
    worker.postMessage({ type: 'close', id });
  };

  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    if (message.type === 'send') {
      if (message.id === LOCAL) local?.onmessage?.({ data: message.raw });
      else void channels.get(message.id)?.line.send(message.raw);
    } else if (message.type === 'drop' && message.id !== LOCAL) {
      drop(message.id);
    } else if (message.type === 'lobby' && !closed) {
      lobby = message.snapshot;
      if (lobby) saveHostedLobby(lobby);
      else clearHostedLobby();
    }
  };

  host.on('connection', (line) => {
    const id = `guest-${nextId++}`;
    line.on('open', () => {
      channels.set(id, { line, lastHeard: Date.now() });
      worker.postMessage({ type: 'open', id });
    });
    line.on('data', (data) => {
      const channel = channels.get(id);
      if (!channel) return;
      channel.lastHeard = Date.now();
      const raw = String(data);
      if (raw !== KEEPALIVE) worker.postMessage({ type: 'data', id, raw });
    });
    line.on('close', () => drop(id));
    line.on('error', () => drop(id));
  });

  // Both ends say they are still there (see peerSocket). A guest silent for
  // too long has gone — a closed tab does not always say so — and the table
  // should stop counting them as here.
  const pulse = setInterval(() => {
    const now = Date.now();
    for (const [id, channel] of channels) {
      if (now - channel.lastHeard > SILENCE_MS) drop(id);
      else void channel.line.send(KEEPALIVE);
    }
  }, KEEPALIVE_MS);

  // Losing the broker does not end the table — the guests already here are
  // connected directly — but new guests find the table through it.
  host.on('disconnected', () => {
    if (!host.destroyed) host.reconnect();
  });

  // Closing the tab closes the table for everyone, so the browser asks first.
  const guard = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', guard);

  // The page going away. A lobby can come back — a reload reopens it — so the
  // guests are told to wait. Once the game has started nothing can bring it
  // back, and they are told at once rather than left to find out from silence.
  const onPageHide = () => {
    if (closed) return;
    const farewell = lobby ? HOST_AWAY : encodeServer({ type: 'CLOSED', reason: HOST_LEFT });
    if (lobby) saveHostedLobby(lobby);
    for (const { line } of channels.values()) void line.send(farewell);
  };
  window.addEventListener('pagehide', onPageHide);

  return {
    code,
    openLocalSocket() {
      const socket: SocketLike = {
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        send: (raw) => worker.postMessage({ type: 'data', id: LOCAL, raw }),
        close: () => worker.postMessage({ type: 'close', id: LOCAL }),
      };
      local = socket;
      setTimeout(() => {
        worker.postMessage({ type: 'open', id: LOCAL });
        socket.onopen?.();
      }, 0);
      return socket;
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(pulse);
      window.removeEventListener('beforeunload', guard);
      window.removeEventListener('pagehide', onPageHide);
      // Leaving on purpose is not a reload: there is no lobby to come back to.
      clearHostedLobby();
      worker.postMessage({ type: 'shutdown', reason: HOST_LEFT });
      // A moment for that goodbye to reach every guest before the lines go.
      setTimeout(() => {
        worker.terminate();
        host.destroy();
      }, 500);
    },
  };
}
