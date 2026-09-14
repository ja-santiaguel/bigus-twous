import type { Card, PlayerId } from '@big-two/engine';
import type { WireSeat } from '@big-two/protocol';
import { createGameSession, type MatchRule, type Pacer, type SeatConfig, type SessionSave } from '@big-two/session';
import { EMPTY_SNAPSHOT, type TableClient, type TableSnapshot } from './types.js';

/**
 * A table running in this tab.
 *
 * It wraps a `GameSession` and turns it into the same push-shaped thing a
 * remote table is. That conversion is the whole file: the session is happy to
 * be asked questions, and this asks them on every change so that the screen
 * never has to know it could have.
 *
 * Nothing here is a simulation of the network. There is no fake latency and no
 * pretend disconnect — a local game should be as immediate as it can be, and
 * the value of sharing the interface is that the *screen* is identical, not
 * that the experience is degraded to match.
 */

export interface LocalTableOptions {
  seats: SeatConfig[];
  seed: string;
  /** Which seat this client is sitting in. */
  you: PlayerId;
  pacer?: Pacer;
  /** What to call the person playing. Blank leaves the seat numbered. */
  name?: string;
  /** How long the match runs. Ignored when resuming: the save carries its own. */
  match?: MatchRule;
  /** Carry on a saved match instead of dealing a new one. */
  resume?: SessionSave;
  /** Handed a fresh save after every change, so a reload loses nothing. */
  onSave?: (save: SessionSave | null) => void;
}

export function createLocalTable(options: LocalTableOptions): TableClient {
  const listeners = new Set<(snapshot: TableSnapshot) => void>();
  const session = createGameSession({
    seats: options.seats,
    seed: options.seed,
    ...(options.pacer ? { pacer: options.pacer } : {}),
    ...(options.resume ? { resume: options.resume } : {}),
    ...(options.match ? { match: options.match } : {}),
  });

  let current: TableSnapshot = { ...EMPTY_SNAPSHOT, you: options.you, status: 'connected' };
  let roundLive = options.resume ? options.resume.state.phase !== 'ROUND_END' : false;
  let name = options.name?.trim() ?? '';

  const seatsOf = (): WireSeat[] =>
    session.seats().map((seat) => ({
      id: seat.id,
      seat: seat.seat,
      // Plainly numbered. Marking the viewer's own seat is the screen's
      // job, and a seat called 'You' reads as 'You (you)' once it does it.
      name: seat.id === options.you && name ? name : `Seat ${seat.seat + 1}`,
      occupant: seat.occupant.kind === 'human' ? 'human' : 'cpu',
      difficulty: seat.occupant.kind === 'cpu' ? seat.occupant.difficulty : 'medium',
      connected: true,
      ready: false,
      host: false,
      standIn: false,
    }));

  function push(events: TableSnapshot['events'], patch: Partial<TableSnapshot> = {}) {
    current = {
      ...current,
      view: session.viewFor(options.you),
      prompt: session.promptFor(options.you),
      ceremony: session.ceremony(),
      seats: seatsOf(),
      seed: session.seed(),
      match: session.match(),
      events,
      seq: current.seq + 1,
      ...patch,
    };
    for (const listener of [...listeners]) listener(current);
  }

  session.subscribe((event) => {
    if (event.type === 'ROUND_STARTED') roundLive = true;
    if (event.type === 'ROUND_ENDED') roundLive = false;
    if (event.type === 'FAILED') {
      push([], { status: 'closed', error: event.message });
      return;
    }
    push(event.type === 'TURN' ? event.events : [], { pending: false });
    options.onSave?.(session.save());
  });

  /** Runs an intent and reports a refusal the same way a server would. */
  function attempt(run: () => { ok: true } | { ok: false; reason: string }) {
    const result = run();
    push([], result.ok ? { error: null } : { error: result.reason, pending: false });
  }

  // A continued match picks up where it was saved: a round in progress plays
  // on from its next turn, and a finished one waits for "Play another round".
  if (options.resume) {
    push([]);
    if (roundLive) session.start();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => current,
    play: (cards: Card[]) => attempt(() => session.submitPlay(options.you, cards)),
    pass: () => attempt(() => session.submitMove(options.you, { kind: 'PASS' })),
    claimPile: (pileIndex) => attempt(() => session.claimPile(options.you, pileIndex)),
    // Nobody to tell: the other three seats are computers and there is no
    // table full of people to be introduced to.
    setName: (next) => {
      name = next.trim();
      push([]);
    },
    setSeed: () => {},
    setDifficulty: () => {},
    takeSeat: () => {},
    kick: () => {},
    setMatch: () => {},
    unready: () => {},
    // Alone, starting and being ready are the same act.
    start: () => {
      if (roundLive) return;
      roundLive = true;
      session.start();
    },
    ready: () => {
      if (roundLive) return;
      roundLive = true;
      session.start();
    },
    dispose: () => {
      listeners.clear();
      session.dispose();
    },
  };
}
