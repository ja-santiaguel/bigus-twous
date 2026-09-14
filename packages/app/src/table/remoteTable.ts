import type { Card } from '@big-two/engine';
import { decodeServer, encodeClient, type ClientMessage } from '@big-two/protocol';
import { randomSecret, verifyRound } from '@big-two/session';
import { EMPTY_SNAPSHOT, type TableClient, type TableSnapshot } from './types.js';

/**
 * A table running somewhere else.
 *
 * The interesting half of this file is not sending messages — that is four
 * lines — it is what happens when the connection goes away, which on a phone
 * is constantly. A dropped socket must not look like a lost game: the seat is
 * held server-side, a computer covers it, and this reconnects and hands back
 * the token it was given, at which point the seat is simply ours again.
 *
 * A snapshot from the server is complete, never a patch, which is what makes
 * that recovery ordinary: there is no replay to catch up on and no diff to
 * reconcile. Reconnecting is the same code path as connecting.
 */

/** Anything shaped like a WebSocket. Injected so tests need no network. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface RemoteTableOptions {
  /** Where the table lives, e.g. `ws://localhost:8787/table/AVXLEY`. */
  url: string;
  table: string;
  name?: string;
  /** Reclaims a seat from a previous visit. */
  token?: string;
  /** Called when the server issues one, so the caller can keep it. */
  onToken?: (token: string) => void;
  openSocket?: (url: string) => SocketLike;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * How long to wait before trying again, per consecutive failure.
 *
 * Backs off, then gives up climbing: a table is a few minutes of somebody's
 * evening, so a client that waits half a minute between attempts has
 * effectively left. The first retry is almost immediate because by far the
 * commonest disconnect is a blip.
 */
const RETRY_MS = [250, 500, 1_000, 2_000, 4_000, 8_000];

export function createRemoteTable(options: RemoteTableOptions): TableClient {
  const listeners = new Set<(snapshot: TableSnapshot) => void>();
  const openSocket = options.openSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let current: TableSnapshot = { ...EMPTY_SNAPSHOT };
  let socket: SocketLike | null = null;
  let token = options.token;
  let attempts = 0;
  let retryTimer: unknown = null;
  let disposed = false;
  /**
   * Intents made while the socket was down.
   *
   * Kept deliberately shallow — only the most recent, and only until the next
   * snapshot. A queue of moves replayed after a reconnection would be moves
   * made against a table that has since moved on, which is worse than losing
   * them: the game had a turn clock precisely so that nobody is owed a move
   * they did not manage to send.
   */
  let pendingIntent: ClientMessage | null = null;

  /*
   * What this seat witnesses at a fair table (9.18), kept to check the host's
   * record against: the seal and our share for each deal, the pile we picked,
   * and the hand we were dealt before any card left it.
   */
  const seals = new Map<number, { commit: string; share: string; pile: number | null }>();
  const dealt = new Map<number, Card[]>();
  let pickedPile: number | null = null;

  function emit(patch: Partial<TableSnapshot>) {
    current = { ...current, ...patch, seq: patch.seq ?? current.seq };
    for (const listener of [...listeners]) listener(current);
  }

  function send(message: ClientMessage): boolean {
    if (!socket || current.status !== 'connected') {
      pendingIntent = message;
      return false;
    }
    socket.send(encodeClient(message));
    return true;
  }

  function connect() {
    if (disposed) return;
    emit({ status: attempts === 0 ? 'connecting' : 'reconnecting' });

    let active: SocketLike;
    try {
      active = openSocket(options.url);
    } catch {
      scheduleRetry();
      return;
    }
    socket = active;

    active.onopen = () => {
      attempts = 0;
      emit({ status: 'connected' });
      // The join carries the token, so the server gives back the same chair
      // rather than treating a reconnection as a new arrival.
      active.send(
        encodeClient({
          type: 'JOIN',
          table: options.table,
          ...(options.name ? { name: options.name } : {}),
          ...(token ? { token } : {}),
        }),
      );
      const queued = pendingIntent;
      pendingIntent = null;
      if (queued) active.send(encodeClient(queued));
    };

    active.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      const decoded = decodeServer(raw);
      if (!decoded.ok) return;
      const message = decoded.message;

      switch (message.type) {
        case 'WELCOME':
          token = message.token;
          options.onToken?.(message.token);
          emit({ you: message.you, error: null });
          return;
        case 'SYNC': {
          const view = message.view;
          if (
            view &&
            view.hand.length === 13 &&
            !dealt.has(view.roundNumber) &&
            !view.history.some((e) => e.type === 'CARDS_PLAYED' && e.playerId === current.you)
          ) {
            dealt.set(view.roundNumber, view.hand);
          }
          emit({
            view: message.view,
            prompt: message.prompt,
            ceremony: message.ceremony,
            seats: message.seats,
            clock: message.clock,
            nextRound: message.nextRound,
            match: message.match,
            seed: message.seed,
            events: message.events,
            seq: message.seq,
            pending: false,
            status: 'connected',
          });
          return;
        }
        case 'DEAL_COMMIT': {
          const share = randomSecret();
          seals.set(message.round, { commit: message.commit, share, pile: pickedPile });
          pickedPile = null;
          send({ type: 'DEAL_SHARE', round: message.round, share });
          return;
        }
        case 'ROUND_AUDIT': {
          const audit = message.audit;
          const seal = seals.get(audit.roundNumber);
          const view = current.view;
          seals.delete(audit.roundNumber);
          const hand = dealt.get(audit.roundNumber) ?? null;
          dealt.delete(audit.roundNumber);
          // Arrived after the deal was sealed — joined late, or reconnected —
          // so there is nothing of our own to hold the record to.
          if (!seal || !current.you || !view) {
            emit({ fairness: { round: audit.roundNumber, status: 'unchecked' } });
            return;
          }
          emit({ fairness: { round: audit.roundNumber, status: 'checking' } });
          void verifyRound(audit, { you: current.you, ...seal, hand, history: view.history, points: view.points })
            .then((verdict) =>
              emit({
                fairness: verdict.ok
                  ? { round: audit.roundNumber, status: 'verified' }
                  : { round: audit.roundNumber, status: 'failed', reason: verdict.reason },
              }),
            )
            .catch(() => emit({ fairness: { round: audit.roundNumber, status: 'failed', reason: 'the check could not run' } }));
          return;
        }
        case 'REJECTED':
          emit({ error: message.reason, pending: false });
          return;
        case 'CLOSED':
          // The server said this is over, so do not fight it with retries.
          disposed = true;
          emit({ status: 'closed', error: message.reason, pending: false });
          return;
      }
    };

    active.onerror = () => {
      /* a failed socket also fires close; retrying is handled there */
    };

    active.onclose = () => {
      if (disposed || socket !== active) return;
      socket = null;
      emit({ status: 'reconnecting', prompt: null, pending: false });
      scheduleRetry();
    };
  }

  function scheduleRetry() {
    if (disposed) return;
    const wait = RETRY_MS[Math.min(attempts, RETRY_MS.length - 1)]!;
    attempts += 1;
    retryTimer = setTimer(() => {
      retryTimer = null;
      connect();
    }, wait);
  }

  connect();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => current,
    play(cards: Card[]) {
      if (send({ type: 'PLAY', move: { kind: 'PLAY', cards } })) emit({ pending: true, error: null });
    },
    pass() {
      if (send({ type: 'PLAY', move: { kind: 'PASS' } })) emit({ pending: true, error: null });
    },
    claimPile(pileIndex) {
      pickedPile = pileIndex;
      if (send({ type: 'CLAIM_PILE', pileIndex })) emit({ pending: true, error: null });
    },
    ready() {
      send({ type: 'READY' });
    },
    unready() {
      send({ type: 'UNREADY' });
    },
    start() {
      send({ type: 'START' });
    },
    setName(name) {
      send({ type: 'SET_NAME', name });
    },
    takeSeat(seat) {
      send({ type: 'TAKE_SEAT', seat });
    },
    setSeed(seed) {
      send({ type: 'SET_SEED', seed });
    },
    setDifficulty(seat, difficulty) {
      send({ type: 'SET_DIFFICULTY', seat, difficulty });
    },
    kick(seat) {
      send({ type: 'KICK', seat });
    },
    setMatch(rule) {
      send({ type: 'SET_MATCH', rule });
    },
    dispose() {
      disposed = true;
      if (retryTimer !== null) clearTimer(retryTimer);
      retryTimer = null;
      socket?.send(encodeClient({ type: 'LEAVE' }));
      socket?.close();
      socket = null;
      listeners.clear();
    },
  };
}
