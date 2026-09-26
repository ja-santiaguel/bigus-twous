import type { Card, GameEvent, PlayerId } from '@big-two/engine';
import type { WireSeat } from '@big-two/protocol';
import {
  createGameSession,
  type MatchRule,
  type Occupant,
  type Pacer,
  type SeatConfig,
  type SessionOptions,
  type SessionSave,
} from '@big-two/session';
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
  /**
   * A variant table's turn options (the campaign's class passives). The base
   * rules when not given — playing on your own never passes this.
   */
  turnOptions?: SessionOptions['turnOptions'];
  /** Seats that sit each round out (a campaign table's broke). Every seat plays when not given. */
  sittingOut?: SessionOptions['sittingOut'];
  /** Pick piles by the last round's placing (a campaign table). Clockwise from the winner when not given. */
  pickByPlacing?: boolean;
  /** Names for the other seats, read each time the seats are shown. Numbered when not given. */
  names?: () => Partial<Record<PlayerId, string>>;
  /**
   * Told of every turn's events before the screen is, with a way to read any
   * seat's hand. For a table that runs something around the cards — the
   * campaign's wagering — in this same tab. Never sent anywhere.
   */
  onTurn?: (events: GameEvent[], table: { handOf(id: PlayerId): Card[] }) => void;
}

/** A table in this tab, with the few extra handles a campaign table uses. */
export interface LocalTableClient extends TableClient {
  /** Hand a seat to someone else — the campaign seating a new player. */
  setOccupant(id: PlayerId, occupant: Occupant): void;
  /** Re-send the snapshot, after something outside the session changed what it shows. */
  refresh(): void;
}

export function createLocalTable(options: LocalTableOptions): LocalTableClient {
  const listeners = new Set<(snapshot: TableSnapshot) => void>();
  const session = createGameSession({
    seats: options.seats,
    seed: options.seed,
    ...(options.pacer ? { pacer: options.pacer } : {}),
    ...(options.resume ? { resume: options.resume } : {}),
    ...(options.match ? { match: options.match } : {}),
    ...(options.turnOptions ? { turnOptions: options.turnOptions } : {}),
    ...(options.sittingOut ? { sittingOut: options.sittingOut } : {}),
    ...(options.pickByPlacing ? { pickByPlacing: true } : {}),
  });
  const inspect = { handOf: (id: PlayerId) => session.viewFor(id)?.hand ?? [] };

  let current: TableSnapshot = { ...EMPTY_SNAPSHOT, you: options.you, status: 'connected' };
  let roundLive = options.resume ? options.resume.state.phase !== 'ROUND_END' : false;
  let name = options.name?.trim() ?? '';

  const seatsOf = (): WireSeat[] =>
    session.seats().map((seat) => ({
      id: seat.id,
      seat: seat.seat,
      // Plainly numbered. Marking the viewer's own seat is the screen's
      // job, and a seat called 'You' reads as 'You (you)' once it does it.
      name: seat.id === options.you && name ? name : (options.names?.()[seat.id] ?? `Seat ${seat.seat + 1}`),
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
      turnTimer: false,
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
    if (event.type === 'TURN') {
      // What listens to the turns runs inside the table's own loop: an error
      // there must not stop the table dead, with no turn for anyone.
      try {
        options.onTurn?.(event.events, inspect);
      } catch (error) {
        console.error('A turn listener failed', error);
      }
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
    setTurnTimer: () => {},
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
    setOccupant: (id, occupant) => {
      session.setOccupant(id, occupant);
      push([]);
    },
    refresh: () => push([]),
  };
}
