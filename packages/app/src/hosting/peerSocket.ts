import Peer, { type DataConnection } from 'peerjs';
import { encodeServer } from '@big-two/protocol';
import type { SocketLike } from '../table/remoteTable.js';
import { HOST_RETURN_MS } from './lobbyRestore.js';

/**
 * A guest's line to a table hosted in someone's browser.
 *
 * Shaped like the WebSocket `remoteTable` already speaks to, so everything a
 * guest does — joining, reclaiming a seat, reconnecting with backoff — is the
 * code a table server's guests already run. PeerJS's free public broker
 * introduces the two browsers; after that they talk directly over WebRTC.
 */

/** Table codes are namespaced on the shared broker, so they never collide with anyone else's peers. */
export const peerIdFor = (code: string) => `bigtwo-table-${code.toUpperCase()}`;

/** Google's public STUN servers: how each browser learns its own public address. */
const STUN: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

let iceServers: Promise<RTCIceServer[]> | null = null;

/**
 * Where browsers look for a route to each other: STUN always, plus a TURN
 * relay when this build is given one.
 *
 * A direct connection works on most networks. Some — many offices, some mobile
 * carriers — block it, and only a relay gets through. No free public relay
 * works without an account, so the relay is configuration (see the README and
 * `.env.example`): either fixed credentials, or a URL that issues short-lived
 * ones. A relay is only used when a direct route fails.
 */
export function loadIceServers(): Promise<RTCIceServer[]> {
  iceServers ??= (async () => {
    const env = import.meta.env ?? {};
    const fromUrl = typeof env.VITE_TURN_CREDENTIALS_URL === 'string' ? env.VITE_TURN_CREDENTIALS_URL : '';
    if (fromUrl) {
      try {
        const response = await fetch(fromUrl);
        const issued: unknown = response.ok ? await response.json() : null;
        if (Array.isArray(issued) && issued.length > 0) return [...STUN, ...(issued as RTCIceServer[])];
      } catch {
        /* fall back to fixed credentials, or to STUN alone */
      }
    }
    const urls = typeof env.VITE_TURN_URLS === 'string' ? env.VITE_TURN_URLS : '';
    if (!urls) return STUN;
    return [
      ...STUN,
      {
        urls: urls
          .split(',')
          .map((url: string) => url.trim())
          .filter(Boolean),
        username: String(env.VITE_TURN_USERNAME ?? ''),
        credential: String(env.VITE_TURN_CREDENTIAL ?? ''),
      },
    ];
  })();
  return iceServers;
}

export async function peerOptions() {
  return { config: { iceServers: await loadIceServers() } };
}

/** How long to wait for a connection, relayed or direct, before saying it will not happen. */
const CONNECT_TIMEOUT_MS = 20_000;

/*
 * Keeping a line honest.
 *
 * WebRTC does not reliably say when the other end has gone: a host's tab
 * closing can leave a guest's connection looking open for minutes, the guest
 * still "waiting for the host to start". So both ends say they are still there
 * every couple of seconds, and a line silent for ten is treated as dropped.
 * These markers travel beside the protocol, not in it — neither is valid JSON,
 * so neither can be mistaken for a message.
 */

/** "Still here." */
export const KEEPALIVE = 'bigtwo:alive';
/** From a host whose page is going away while its lobby can be reopened (9.18). */
export const HOST_AWAY = 'bigtwo:host-away';
export const KEEPALIVE_MS = 2_000;
/** Generous on purpose: a throttled background tab, or a phone switching apps for a moment, still answers well within it. */
export const SILENCE_MS = 10_000;

/** When each table's host was lost, while this browser waits for them to come back. */
const hostLostAt = new Map<string, number>();

export interface PeerSocketOptions {
  /**
   * Whether a host who went away might come back: true in the lobby, which a
   * host's reloaded page reopens (9.18). Once the game has started it cannot,
   * so there is nothing to wait for.
   */
  mayWaitForHost?: () => boolean;
}

export function openPeerSocket(code: string, options: PeerSocketOptions = {}): SocketLike {
  let peer: Peer | null = null;
  let connection: DataConnection | null = null;
  let opened = false;
  let finished = false;
  let lastHeard = 0;
  let pulse: ReturnType<typeof setInterval> | null = null;

  const stopTimers = () => {
    clearTimeout(timer);
    if (pulse !== null) clearInterval(pulse);
    pulse = null;
  };

  const socket: SocketLike = {
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send: (raw) => {
      if (connection?.open) void connection.send(raw);
    },
    close: () => {
      finished = true;
      stopTimers();
      connection?.close();
      peer?.destroy();
    },
  };

  /** Say the table is gone, which stops the client retrying. */
  const closeTable = (reason: string) => socket.onmessage?.({ data: encodeServer({ type: 'CLOSED', reason }) });

  /** This attempt is over. The client tries again unless the table was closed. */
  const finish = () => {
    if (finished) return;
    finished = true;
    stopTimers();
    peer?.destroy();
    socket.onclose?.();
  };

  /** A line that had been working went away. */
  const lost = () => {
    if (opened && !hostLostAt.has(code)) hostLostAt.set(code, Date.now());
    finish();
  };

  /** The broker says nobody is at this code. */
  const nobodyThere = () => {
    const since = hostLostAt.get(code);
    if (since === undefined) {
      closeTable('No table with that code is open. The host may have left.');
    } else if (!(options.mayWaitForHost?.() ?? false) || Date.now() - since >= HOST_RETURN_MS) {
      hostLostAt.delete(code);
      closeTable('The host left, so this table has closed.');
    }
    // Otherwise keep trying: the host's page may be on its way back.
    finish();
  };

  const timer = setTimeout(() => {
    if (opened) return;
    // A table this browser was just sitting at is worth trying again. A first
    // attempt that never connected is a network that will not.
    if (!hostLostAt.has(code)) {
      closeTable("Couldn't connect to the host's browser. Your network may block direct connections.");
    }
    finish();
  }, CONNECT_TIMEOUT_MS);

  void peerOptions().then((config) => {
    if (finished) return;
    const self = new Peer(config);
    peer = self;

    self.on('open', () => {
      const line = self.connect(peerIdFor(code), { reliable: true });
      connection = line;
      line.on('open', () => {
        opened = true;
        clearTimeout(timer);
        hostLostAt.delete(code);
        lastHeard = Date.now();
        pulse = setInterval(() => {
          if (Date.now() - lastHeard > SILENCE_MS) return lost();
          if (line.open) void line.send(KEEPALIVE);
        }, KEEPALIVE_MS);
        socket.onopen?.();
      });
      line.on('data', (data) => {
        lastHeard = Date.now();
        const raw = String(data);
        if (raw === KEEPALIVE) return;
        if (raw === HOST_AWAY) return lost();
        socket.onmessage?.({ data: raw });
      });
      line.on('close', lost);
      line.on('error', lost);
    });

    self.on('error', (error) => {
      if (error.type === 'peer-unavailable') nobodyThere();
      else lost();
    });
  });

  return socket;
}
