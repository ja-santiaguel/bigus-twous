import type { Difficulty } from '@big-two/ai';
import type { GameEvent, PlayerId } from '@big-two/engine';
import {
  encodeServer,
  type ClientEnvelope,
  type TableCode,
  type WireClock,
  type WireCountdown,
  type WireMatch,
  type WireRoundAudit,
  type WireSeat,
} from '@big-two/protocol';
import {
  combineDealSeed,
  createGameSession,
  makePacer,
  randomSecret,
  sha256Hex,
  SEAT_IDS,
  type GameSession,
  type SeatConfig,
  type Pacer,
  type SessionEvent,
  type Speed,
} from '@big-two/session';

/**
 * A table, with people connected to it.
 *
 * The `GameSession` underneath already knows how to run a game for four seats
 * and refuses to tell any of them what the others hold. What this adds is
 * everything that only matters once those seats are *somewhere else*: who is
 * connected, who has dropped, who may reclaim which chair, and what happens
 * when a person stops answering.
 *
 * It is deliberately not a socket. A connection here is anything that can be
 * sent a string and closed, which keeps the whole of this file testable
 * without a network and means the choice of transport — a `ws` server, an edge
 * runtime, something else — is one small adapter rather than a rewrite. The
 * hosting decision is still open, so nothing in the core assumes it.
 */

/** Anything that can be sent a message and closed. A socket, or a test double. */
export interface Connection {
  readonly id: string;
  send(raw: string): void;
  close(reason?: string): void;
}

export interface TableOptions {
  code: TableCode;
  seed: string;
  /** Difficulty for computer seats, including seats covering for a dropout. */
  difficulty?: Difficulty;
  /**
   * How long a person gets to move before the table plays for them.
   *
   * A table of four stops dead for one person who walked away mid-turn, and
   * the other three have no way to do anything about it. Zero disables the
   * clock, which is what the tests use when they mean to block on purpose.
   */
  turnTimeoutMs?: number;
  /**
   * How long a person gets to pick a pile before the table picks for them.
   * Shorter than a turn: the piles are blind, so there is nothing to weigh
   * up, and everyone else is waiting on one click. Zero disables it.
   */
  pickTimeoutMs?: number;
  /**
   * How long the table waits between rounds once somebody is ready.
   *
   * The same problem as the turn clock, one level up: a round only deals when
   * every person agrees, so one person who wandered off at the scores screen
   * held the whole table there forever. When this runs out the round deals
   * anyway, and a computer plays for whoever had not said yes — until they
   * come back and take their seat. Zero disables it.
   */
  readyCountdownMs?: number;
  /**
   * How long a seat is held for a person who dropped or left mid-match.
   *
   * Held, because a dropped connection is usually a blip and the person is
   * coming straight back. Not forever, because a seat held for somebody who
   * went home is a seat nobody else can ever sit in. When it runs out the seat
   * is freed, and the next person through the link takes it. Zero or less
   * holds seats indefinitely.
   */
  rejoinGraceMs?: number;
  /**
   * Deal from a shuffle every connected person contributes to, and hand every
   * seat the round's full record when it ends (9.18). For a table running in a
   * player's browser, whose owner must not be able to steer the deal or fake a
   * move. A table server is trusted and leaves this off.
   */
  fairDeal?: boolean;
  /** How long to wait for shuffle shares before dealing without the missing ones. */
  shareTimeoutMs?: number;
  /** Injected so tests can drive time rather than wait for it. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Mints seat tokens. Injected so tests get predictable ones. */
  makeToken?: () => string;
  /** Reads the wall clock. Injected so tests can decide what time it is. */
  now?: () => number;
  /**
   * How long computer seats appear to think.
   *
   * A table-wide setting, not a per-person preference: four clients have to
   * see the same table at the same time, and none of them gets to decide the
   * pace for the others. `instant` is for tests — it still leaves a buffer so
   * a turn is never over before anybody saw it.
   */
  speed?: Speed;
  /**
   * Whether pacing applies at all.
   *
   * Not a speed — even the fastest speed keeps a buffer so a turn is never
   * over before anybody saw it. This says nobody is watching, which is true of
   * a test and of nothing else.
   */
  paced?: boolean;
  /** Overrides the pacer outright. Injected so a test can watch it being used. */
  pacer?: Pacer;
  /**
   * A lobby to carry on from: the one this table's host was running before
   * their page reloaded (9.18). Seats come back held for their people, who
   * take them back with the tokens they already have.
   */
  restore?: LobbySnapshot;
  /** Called whenever the table sends out a new picture, so a host can keep a copy of its lobby. */
  onChange?: () => void;
}

/** Everything a lobby is before the first deal — enough to open it again. */
export interface LobbySnapshot {
  version: 1;
  code: TableCode;
  seed: string;
  match: WireMatch['rule'];
  joinOrder: number;
  seats: Array<{ seat: number; name: string; token: string | null; joinedAt: number | null; difficulty: Difficulty }>;
}

interface Occupancy {
  id: PlayerId;
  seat: number;
  name: string;
  /** Null for a seat that was never anybody's. */
  token: string | null;
  connection: Connection | null;
  /** True once a person has held this seat, even if they are away now. */
  claimed: boolean;
  ready: boolean;
  /** How a computer plays this seat whenever one is covering it. */
  difficulty: Difficulty;
  /**
   * When this person first sat down, as an arrival order. The longest-seated
   * connected person hosts, so it follows the seat when they move and is
   * cleared when the seat is given back.
   */
  joinedAt: number | null;
  /**
   * Connected, but a computer is playing for them: they were not ready when
   * the countdown between rounds ran out. They take the seat back by saying
   * they are ready.
   */
  standIn: boolean;
  /** Frees the seat if its person has not come back in time. */
  releaseTimer: unknown;
}

export class Table {
  private readonly session: GameSession;
  private readonly occupancy: Occupancy[];
  private readonly options: Required<Omit<TableOptions, 'code' | 'seed' | 'restore'>> & {
    code: TableCode;
    seed: string;
    restore?: LobbySnapshot;
  };
  private seq = 0;
  private joinOrder = 0;
  private turnTimer: unknown = null;
  /** When the current turn's clock started, and whose it is. */
  private clockFrom: { playerId: PlayerId; startedAt: number; totalMs: number } | null = null;
  private readyTimer: unknown = null;
  /** When the countdown to the next round started. */
  private readyFrom: number | null = null;
  /** Set while a round is in progress, so READY only counts between rounds. */
  private roundLive = false;
  /** Set at the first deal. Seats are fixed from then on. */
  private matchStarted = false;
  private closed = false;
  /** The sealed shuffle for the round being dealt, kept until its audit is sent. */
  private shuffle: {
    round: number;
    secret: string;
    commit: string;
    shares: Record<PlayerId, string>;
    sealed: boolean;
    check: () => void;
  } | null = null;

  constructor(options: TableOptions) {
    this.options = {
      difficulty: 'medium',
      turnTimeoutMs: 60_000,
      pickTimeoutMs: 15_000,
      readyCountdownMs: 30_000,
      rejoinGraceMs: 120_000,
      fairDeal: false,
      shareTimeoutMs: 8_000,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      makeToken: () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      now: () => Date.now(),
      speed: 'normal',
      paced: true,
      pacer: makePacer({ speed: () => options.speed ?? 'normal', paced: () => options.paced ?? true }),
      onChange: () => {},
      ...options,
    };

    this.occupancy = SEAT_IDS.map((id, seat) => ({
      id,
      seat,
      name: `Seat ${seat + 1}`,
      token: null,
      connection: null,
      claimed: false,
      ready: false,
      difficulty: this.options.difficulty,
      joinedAt: null,
      standIn: false,
      releaseTimer: null,
    }));

    // Every seat starts as a computer. A table exists before anybody arrives
    // and keeps existing after they leave, so a seat's *default* state is
    // playable rather than empty — which is also exactly what a dropout needs.
    this.session = createGameSession({
      seats: this.occupancy.map((o): SeatConfig => ({
        id: o.id,
        seat: o.seat,
        occupant: { kind: 'cpu', difficulty: o.difficulty },
      })),
      seed: options.seed,
      // Paced here rather than left to each client. A computer that answers
      // the instant it is asked makes a trick go round before anybody saw it
      // happen, and pacing it in the clients would have four people watching
      // four different games.
      pacer: this.options.pacer,
      ...(this.options.fairDeal ? { dealSeed: (round: number) => this.gatherShuffle(round) } : {}),
    });

    this.session.subscribe((event) => this.onSessionEvent(event));
    if (options.restore) this.restoreLobby(options.restore);
  }

  get code(): TableCode {
    return this.options.code;
  }

  /** True when nobody is connected and no seat is being held for a return. */
  get abandoned(): boolean {
    return this.occupancy.every((o) => o.connection === null);
  }

  /**
   * The lobby as it stands, to reopen it with (9.18). Null once the first round
   * is dealt: from then on the table is hands, scores and a sealed shuffle,
   * none of which a copy kept in the host's page could be trusted to restore.
   */
  lobbySnapshot(): LobbySnapshot | null {
    if (this.matchStarted || this.closed) return null;
    return {
      version: 1,
      code: this.options.code,
      seed: this.session.seed(),
      match: this.session.match().rule,
      joinOrder: this.joinOrder,
      seats: this.occupancy.map((o) => ({
        seat: o.seat,
        name: o.name,
        token: o.claimed ? o.token : null,
        joinedAt: o.joinedAt,
        difficulty: o.difficulty,
      })),
    };
  }

  // ── Connections ───────────────────────────────────────────────────────

  /**
   * Handle one decoded message from one connection.
   *
   * Decoding and validation happen before this — by the time a message is
   * here it is structurally a message, and what is left to check is whether
   * *this* connection is allowed to do it.
   */
  handle(connection: Connection, envelope: ClientEnvelope): void {
    if (this.closed) return this.reject(connection, envelope.id, 'This table has closed.');
    const message = envelope.message;

    if (message.type === 'JOIN') return this.join(connection, envelope.id, message.name, message.token);

    const seat = this.seatOfConnection(connection);
    if (!seat) return this.reject(connection, envelope.id, 'Join the table first.');

    switch (message.type) {
      case 'CLAIM_PILE': {
        if (seat.standIn)
          return this.reject(connection, envelope.id, 'A computer is playing your seat. Take it back first.');
        const result = this.session.claimPile(seat.id, message.pileIndex);
        if (!result.ok) this.reject(connection, envelope.id, result.reason);
        else this.clearTurnTimer();
        return;
      }
      case 'PLAY': {
        if (seat.standIn)
          return this.reject(connection, envelope.id, 'A computer is playing your seat. Take it back first.');
        const result =
          message.move.kind === 'PASS'
            ? this.session.submitMove(seat.id, { kind: 'PASS' })
            : this.session.submitPlay(seat.id, message.move.cards);
        if (!result.ok) this.reject(connection, envelope.id, result.reason);
        else this.clearTurnTimer();
        return;
      }
      case 'SET_NAME': {
        // Names are how a table stops being four numbered chairs, so changing
        // one is an ordinary thing to do at any point rather than something
        // fixed at the door.
        seat.name = message.name;
        this.broadcast([]);
        return;
      }
      case 'SET_SEED': {
        const result = this.session.reseed(message.seed);
        if (!result.ok) return this.reject(connection, envelope.id, result.reason);
        this.broadcast([]);
        return;
      }
      case 'SET_DIFFICULTY': {
        // The host's call, like the match length: how hard the computers play
        // shapes everyone's game, so one person owns it rather than whoever
        // clicked last. Open until the deal, and everyone sees the change.
        if (this.hostSeat() !== seat) {
          return this.reject(connection, envelope.id, 'Only the host can change computer difficulty.');
        }
        if (this.matchStarted) {
          return this.reject(connection, envelope.id, 'Difficulty is fixed once the first round is dealt.');
        }
        const target = this.occupancy[message.seat];
        if (!target) return this.reject(connection, envelope.id, 'No such seat.');
        if (target.claimed) return this.reject(connection, envelope.id, 'That seat belongs to a person.');
        target.difficulty = message.difficulty;
        this.session.setOccupant(target.id, { kind: 'cpu', difficulty: message.difficulty });
        this.clearReadiness();
        this.broadcast([]);
        return;
      }
      case 'TAKE_SEAT': {
        if (this.matchStarted) {
          return this.reject(connection, envelope.id, 'Seats are fixed once the first round is dealt.');
        }
        const target = this.occupancy[message.seat];
        if (!target) return this.reject(connection, envelope.id, 'No such seat.');
        if (target === seat) return;
        // Only a chair nobody has sat in. A claimed seat whose person has
        // dropped is being held for them, and taking it would strand them.
        if (target.claimed) return this.reject(connection, envelope.id, 'That seat is taken.');

        // The person moves; the chair they left goes back to the computer.
        // Their token and their place in the arrival order move with them, so
        // a reconnection finds the new seat and a host is still the host.
        const unnamed = /^Seat \d+$/.test(seat.name);
        target.connection = seat.connection;
        target.token = seat.token;
        target.name = unnamed ? `Seat ${target.seat + 1}` : seat.name;
        target.claimed = true;
        target.ready = false;
        target.joinedAt = seat.joinedAt;

        this.release(seat);

        this.session.setOccupant(seat.id, { kind: 'cpu', difficulty: seat.difficulty });
        this.session.setOccupant(target.id, { kind: 'human' });

        // Tell the mover which seat they are in now; everyone else just sees
        // the table change.
        connection.send(
          encodeServer({
            type: 'WELCOME',
            you: target.id,
            table: this.options.code,
            token: target.token!,
            version: 1,
          }),
        );
        this.broadcast([]);
        return;
      }
      case 'DEAL_SHARE': {
        const shuffle = this.shuffle;
        // Only for the deal being gathered, only once per seat, and never after
        // the seed is settled: a share added then would not be in the deal.
        if (!shuffle || shuffle.sealed || shuffle.round !== message.round || shuffle.shares[seat.id]) return;
        shuffle.shares[seat.id] = message.share;
        shuffle.check();
        return;
      }
      case 'SET_MATCH': {
        // The host's call, unlike the seed: the length of the evening is a
        // decision somebody has to own, and a setting anyone can flip is one
        // two people end up fighting over in the lobby.
        if (this.hostSeat() !== seat)
          return this.reject(connection, envelope.id, 'Only the host can change the match length.');
        const result = this.session.setMatch(message.rule);
        if (!result.ok) return this.reject(connection, envelope.id, result.reason);
        this.clearReadiness();
        this.broadcast([]);
        return;
      }
      case 'KICK': {
        // The host runs the lobby. Removing somebody is a lobby decision —
        // once cards are dealt, a seat carries a score and a hand, and taking
        // it from a person is no longer tidying up the room.
        if (this.hostSeat() !== seat) return this.reject(connection, envelope.id, 'Only the host can remove people.');
        if (this.matchStarted) {
          return this.reject(connection, envelope.id, 'People can only be removed before the first deal.');
        }
        const target = this.occupancy[message.seat];
        if (!target || !target.claimed) return this.reject(connection, envelope.id, 'Nobody is sitting there.');
        if (target === seat) return this.reject(connection, envelope.id, 'You cannot remove yourself.');

        const gone = target.connection;
        this.clearRelease(target);
        // Released before the socket is closed, so the disconnect that closing
        // it sets off finds no seat and changes nothing. The token goes with
        // it: a stale one reclaims nothing, and arriving again through the
        // link is arriving as somebody new.
        this.release(target);
        this.session.setOccupant(target.id, { kind: 'cpu', difficulty: target.difficulty });
        gone?.send(encodeServer({ type: 'CLOSED', reason: 'You were removed from the table.' }));
        gone?.close('Removed from the table');
        this.broadcast([]);
        return;
      }
      case 'READY': {
        if (seat.standIn) {
          // Coming back. The computer that stood in hands the seat over, and
          // if it is this seat's turn the clock starts for the person again.
          seat.standIn = false;
          this.session.setOccupant(seat.id, { kind: 'human' });
          if (this.session.promptFor(seat.id)) this.armTurnTimer();
          this.broadcast([]);
          return;
        }
        if (this.roundLive) return;
        seat.ready = true;
        // Before the first deal, readiness is a signal to the host, who starts
        // the game. Between rounds it is the vote that deals the next one.
        if (this.matchStarted) {
          this.maybeStartRound();
          if (!this.roundLive) this.armReadyCountdown();
        }
        this.broadcast([]);
        return;
      }
      case 'UNREADY': {
        // In the lobby, or between rounds until the deal (9.16). Not for a seat
        // a computer is covering: they are out of the vote until they take it back.
        if (this.roundLive || seat.standIn || !seat.ready) return;
        seat.ready = false;
        this.stopUnwantedCountdown();
        this.broadcast([]);
        return;
      }
      case 'START': {
        if (this.hostSeat() !== seat) return this.reject(connection, envelope.id, 'Only the host can start the game.');
        if (this.matchStarted) return this.reject(connection, envelope.id, 'The game has already started.');
        // Everyone else connected has to have said yes. The host saying "start"
        // is the host's yes.
        const waiting = this.occupancy.filter((o) => o !== seat && o.connection !== null && !o.ready).length;
        if (waiting > 0) {
          return this.reject(
            connection,
            envelope.id,
            `Waiting for ${waiting === 1 ? 'one player' : `${waiting} players`} to ready up.`,
          );
        }
        this.startRound();
        this.broadcast([]);
        return;
      }
      case 'RESYNC':
        return this.syncTo(seat, []);
      case 'LEAVE':
        return this.leave(seat, connection);
    }
  }

  /**
   * Somebody's connection went away.
   *
   * Their seat does not. A computer covers it so the other three can keep
   * playing, the seat stays marked as theirs, and the token they were given
   * still reclaims it. This is the whole reason seats and connections are
   * separate things here.
   */
  disconnect(connection: Connection): void {
    const seat = this.seatOfConnection(connection);
    if (!seat) return;
    seat.connection = null;
    seat.ready = false;
    seat.standIn = false;
    this.session.setOccupant(seat.id, { kind: 'cpu', difficulty: seat.difficulty });
    this.armRelease(seat);
    // Nobody waits on a share from someone who has gone.
    this.shuffle?.check();
    // They may have been the only one the table was waiting for — or the only
    // one asking for the next round.
    this.maybeStartRound();
    this.stopUnwantedCountdown();
    this.broadcast([]);
  }

  close(reason = 'Table closed.'): void {
    if (this.closed) return;
    this.closed = true;
    this.clearTurnTimer();
    this.clearReadyCountdown();
    for (const seat of this.occupancy) this.clearRelease(seat);
    this.session.dispose();
    for (const seat of this.occupancy) {
      seat.connection?.send(encodeServer({ type: 'CLOSED', reason }));
      seat.connection?.close(reason);
      seat.connection = null;
    }
  }

  private join(connection: Connection, id: string | undefined, name?: string, token?: string): void {
    // A token beats everything: it names a specific chair, and the person
    // holding it is the person who was sitting in it.
    const reclaimed = token ? this.occupancy.find((o) => o.token === token) : undefined;
    const seat = reclaimed ?? this.occupancy.find((o) => !o.claimed);

    if (!seat) return this.reject(connection, id, 'This table is full.');
    if (seat.connection && seat.connection !== connection) {
      // Two tabs, one token. The newer one wins and the older is told why,
      // rather than both being fed the same seat and quietly fighting over it.
      seat.connection.send(encodeServer({ type: 'CLOSED', reason: 'This seat was opened somewhere else.' }));
      seat.connection.close('Seat taken over');
    }

    this.clearRelease(seat);
    seat.connection = connection;
    seat.claimed = true;
    seat.ready = false;
    seat.standIn = false;
    seat.token ??= this.options.makeToken();
    seat.joinedAt ??= this.joinOrder++;
    if (name) seat.name = name;

    this.session.setOccupant(seat.id, { kind: 'human' });

    connection.send(
      encodeServer({
        type: 'WELCOME',
        you: seat.id,
        table: this.options.code,
        token: seat.token,
        version: 1,
      }),
    );
    this.broadcast([]);
  }

  /**
   * Somebody chose to go.
   *
   * In the lobby that is the end of it: nothing is in play, and a chair held
   * for a person who walked out is a chair nobody else can take. Once cards are
   * dealt the seat has a hand and points in it, so leaving is treated like a
   * dropped connection — held for a while, in case it was a mistake.
   */
  private leave(seat: Occupancy, connection: Connection): void {
    if (this.matchStarted) return this.disconnect(connection);
    this.clearRelease(seat);
    this.release(seat);
    this.session.setOccupant(seat.id, { kind: 'cpu', difficulty: seat.difficulty });
    this.maybeStartRound();
    this.stopUnwantedCountdown();
    this.broadcast([]);
  }

  private armRelease(seat: Occupancy): void {
    this.clearRelease(seat);
    if (this.closed || !seat.claimed || this.options.rejoinGraceMs <= 0) return;
    seat.releaseTimer = this.options.setTimer(() => {
      seat.releaseTimer = null;
      if (this.closed || seat.connection !== null || !seat.claimed) return;
      this.release(seat);
      this.broadcast([]);
    }, this.options.rejoinGraceMs);
  }

  private clearRelease(seat: Occupancy): void {
    if (seat.releaseTimer !== null) this.options.clearTimer(seat.releaseTimer);
    seat.releaseTimer = null;
  }

  /**
   * Settle a deal nobody can steer (9.18).
   *
   * The host's part is sealed — its hash sent — before anyone's share is asked
   * for, so it cannot be chosen to suit them. Every connected person answers
   * with a random share, and the deal seed is the hash of all of it. A share
   * that does not arrive in time is simply not in the deal: waiting forever on
   * a slow phone would be a way to stall the table.
   */
  private async gatherShuffle(round: number): Promise<string> {
    const secret = randomSecret();
    const commit = await sha256Hex(secret);
    const shares: Record<PlayerId, string> = {};
    await new Promise<void>((resolve) => {
      let timer: unknown = null;
      const entry = {
        round,
        secret,
        commit,
        shares,
        sealed: false,
        check: () => {
          if (entry.sealed) return;
          const waiting = this.occupancy.some((o) => o.connection !== null && !o.standIn && !shares[o.id]);
          if (!waiting || this.closed) seal();
        },
      };
      const seal = () => {
        if (entry.sealed) return;
        entry.sealed = true;
        if (timer !== null) this.options.clearTimer(timer);
        resolve();
      };
      this.shuffle = entry;
      for (const seat of this.occupancy) seat.connection?.send(encodeServer({ type: 'DEAL_COMMIT', round, commit }));
      timer = this.options.setTimer(seal, this.options.shareTimeoutMs);
      entry.check();
    });
    return combineDealSeed(secret, shares);
  }

  /** Hand every seat the round's full record, to check for itself. */
  private sendAudit(): void {
    const record = this.session.roundRecord();
    const shuffle = this.shuffle;
    const history = this.session.viewFor(SEAT_IDS[0]!)?.history;
    if (!record || !shuffle || shuffle.round !== record.roundNumber || !history) return;
    const audit: WireRoundAudit = {
      ...record,
      commit: shuffle.commit,
      hostSecret: shuffle.secret,
      shares: { ...shuffle.shares },
      history,
    };
    for (const seat of this.occupancy) seat.connection?.send(encodeServer({ type: 'ROUND_AUDIT', audit }));
    this.shuffle = null;
  }

  /**
   * The host changed what the game will be, so the players who readied up
   * agreed to something else. They ready up again for what is set now.
   */
  private clearReadiness(): void {
    if (this.matchStarted) return;
    for (const o of this.occupancy) o.ready = false;
  }

  /** Give a seat back to nobody. The caller decides who plays it next. */
  private release(seat: Occupancy): void {
    seat.connection = null;
    seat.token = null;
    seat.name = `Seat ${seat.seat + 1}`;
    seat.claimed = false;
    seat.ready = false;
    seat.standIn = false;
    seat.joinedAt = null;
  }

  /**
   * Who runs the lobby: the connected person who has been at the table
   * longest. That is whoever opened it, until they leave — and then the next
   * longest-seated, rather than a lobby with nobody able to tidy it.
   */
  private hostSeat(): Occupancy | undefined {
    let host: Occupancy | undefined;
    for (const o of this.occupancy) {
      if (o.connection === null || o.joinedAt === null) continue;
      if (!host || o.joinedAt < host.joinedAt!) host = o;
    }
    return host;
  }

  // ── Rounds ────────────────────────────────────────────────────────────

  /**
   * Start a round when the table agrees.
   *
   * "Agrees" means every connected person has said so. Seats being played by a
   * computer are not consulted — they would always say yes, and a table where
   * three of the four voters are machines is not taking a vote. Nor is a person
   * a computer is already standing in for: they missed the last vote, and
   * making the table wait on them again is the problem the countdown solves.
   */
  private maybeStartRound(): void {
    // The first round is the host's to start (START); this only deals between rounds.
    if (this.roundLive || this.closed || !this.matchStarted) return;
    const people = this.occupancy.filter((o) => o.connection !== null && !o.standIn);
    if (people.length === 0 || !people.every((o) => o.ready)) return;
    this.startRound();
  }

  /**
   * Between rounds, once one person is ready, the others have a fixed time to
   * agree. Not before the first deal: a lobby is where people are still
   * arriving and choosing seats, and nobody should be dealt in mid-sentence.
   */
  private armReadyCountdown(): void {
    if (!this.matchStarted || this.readyTimer !== null || this.closed || this.options.readyCountdownMs <= 0) return;
    this.readyFrom = this.options.now();
    this.readyTimer = this.options.setTimer(() => {
      this.readyTimer = null;
      this.readyFrom = null;
      this.startWithStandIns();
    }, this.options.readyCountdownMs);
  }

  private clearReadyCountdown(): void {
    if (this.readyTimer !== null) this.options.clearTimer(this.readyTimer);
    this.readyTimer = null;
    this.readyFrom = null;
  }

  /**
   * The countdown is somebody asking for the next round. Once nobody connected
   * is ready it has nobody to deal for, so it stops, and whoever readies up
   * next starts it again from the top (9.11).
   */
  private stopUnwantedCountdown(): void {
    if (this.readyTimer === null) return;
    if (!this.occupancy.some((o) => o.connection !== null && o.ready)) this.clearReadyCountdown();
  }

  /** Pick up a lobby where its host's last page left it (9.18). */
  private restoreLobby(snapshot: LobbySnapshot): void {
    this.session.setMatch(snapshot.match);
    this.joinOrder = snapshot.joinOrder;
    for (const saved of snapshot.seats) {
      const seat = this.occupancy[saved.seat];
      if (!seat) continue;
      seat.difficulty = saved.difficulty;
      if (saved.token) {
        // Held for its person exactly as if they had dropped: their token takes it back.
        seat.token = saved.token;
        seat.name = saved.name;
        seat.claimed = true;
        seat.joinedAt = saved.joinedAt;
        this.armRelease(seat);
      }
      this.session.setOccupant(seat.id, { kind: 'cpu', difficulty: seat.difficulty });
    }
  }

  /** The countdown ran out: deal, with a computer in for anybody not ready. */
  private startWithStandIns(): void {
    if (this.roundLive || this.closed) return;
    const people = this.occupancy.filter((o) => o.connection !== null);
    // Whoever started the countdown may have left since. Nobody is asking for
    // a round, so there is nobody to deal one for.
    if (!people.some((o) => o.ready)) return;
    for (const o of people) {
      if (o.ready || o.standIn) continue;
      o.standIn = true;
      this.session.setOccupant(o.id, { kind: 'cpu', difficulty: o.difficulty });
    }
    this.startRound();
    this.broadcast([]);
  }

  private startRound(): void {
    this.clearReadyCountdown();
    for (const seat of this.occupancy) seat.ready = false;
    this.roundLive = true;
    this.matchStarted = true;
    this.session.start();
  }

  // ── Outbound ──────────────────────────────────────────────────────────

  private onSessionEvent(event: SessionEvent): void {
    if (event.type === 'FAILED') {
      this.close('The table hit a problem and had to stop.');
      return;
    }
    if (event.type === 'ROUND_STARTED') this.roundLive = true;
    if (event.type === 'ROUND_ENDED') this.roundLive = false;

    // Armed *before* the broadcast, so the snapshot that tells a seat it is
    // their turn carries the clock that started when it did. Arming afterwards
    // meant the clock appeared one message late — invisible on a fast table
    // and, on a slow one, a countdown that started somewhere short of the top.
    this.armTurnTimer();
    this.broadcast(event.type === 'TURN' ? event.events : []);
    // After the broadcast, so each seat checks the record against a final
    // picture it already has.
    if (event.type === 'ROUND_ENDED' && this.options.fairDeal) this.sendAudit();
  }

  /**
   * Send every connected seat its own picture.
   *
   * Each gets a different message, because each is allowed to know different
   * things — which is the one place a broadcast in a card game differs from a
   * broadcast anywhere else. There is no shared payload to accidentally widen.
   */
  private broadcast(events: GameEvent[]): void {
    this.seq += 1;
    for (const seat of this.occupancy) {
      if (seat.connection) this.syncTo(seat, events, this.seq);
    }
    this.options.onChange();
  }

  private syncTo(seat: Occupancy, events: GameEvent[], seq = this.seq): void {
    seat.connection?.send(
      encodeServer({
        type: 'SYNC',
        seq,
        view: this.session.viewFor(seat.id),
        // Nothing to decide while a computer is playing for you: the prompt is
        // the computer's.
        prompt: seat.standIn ? null : this.session.promptFor(seat.id),
        ceremony: this.session.ceremony(),
        seats: this.wireSeats(),
        events,
        clock: this.wireClock(),
        nextRound: this.wireNextRound(),
        match: this.session.match(),
        seed: this.session.seed(),
      }),
    );
  }

  private wireSeats(): WireSeat[] {
    const host = this.hostSeat();
    return this.occupancy.map((o) => ({
      id: o.id,
      seat: o.seat,
      name: o.name,
      // `away` is a person who dropped and whose chair a computer is covering;
      // `cpu` is a chair nobody ever sat in. At the table that difference is
      // the difference between waiting for someone and not.
      occupant: o.connection ? 'human' : o.claimed ? 'away' : 'cpu',
      connected: o.connection !== null,
      difficulty: o.difficulty,
      ready: o.ready,
      host: o === host,
      standIn: o.standIn,
    }));
  }

  /**
   * How long the seat on the clock has left, as a duration rather than a
   * deadline — the client's clock is not this one's, and a phone a few seconds
   * out would show a countdown that is confidently wrong.
   */
  private wireClock(): WireClock | null {
    if (!this.clockFrom) return null;
    const elapsed = this.options.now() - this.clockFrom.startedAt;
    return {
      playerId: this.clockFrom.playerId,
      remainingMs: Math.max(0, this.clockFrom.totalMs - elapsed),
      totalMs: this.clockFrom.totalMs,
    };
  }

  /** The countdown to the next round, as a duration, for the same reason. */
  private wireNextRound(): WireCountdown | null {
    if (this.readyFrom === null) return null;
    const elapsed = this.options.now() - this.readyFrom;
    return {
      remainingMs: Math.max(0, this.options.readyCountdownMs - elapsed),
      totalMs: this.options.readyCountdownMs,
    };
  }

  private reject(connection: Connection, id: string | undefined, reason: string): void {
    connection.send(encodeServer({ type: 'REJECTED', ...(id !== undefined ? { id } : {}), reason }));
  }

  // ── The turn clock ────────────────────────────────────────────────────

  /**
   * Give the seat on turn a deadline, if a person is sitting in it.
   *
   * Only people get a clock. A computer answers immediately and a seat already
   * being covered is not waiting on anybody, so there is nothing to time out.
   */
  private armTurnTimer(): void {
    this.clearTurnTimer();
    if (this.closed) return;

    const waiting = this.occupancy.find(
      (o) => o.connection !== null && !o.standIn && this.session.promptFor(o.id) !== null,
    );
    if (waiting) {
      if (this.options.turnTimeoutMs > 0) {
        this.startClock(waiting.id, this.options.turnTimeoutMs, () => this.playForAbsentee(waiting.id));
      }
      return;
    }

    // The pile pick, which has a clock of its own.
    const ceremony = this.session.ceremony();
    if (ceremony.kind !== 'picking' || !ceremony.picker || this.options.pickTimeoutMs <= 0) return;
    const picker = this.occupancy.find((o) => o.id === ceremony.picker && o.connection !== null && !o.standIn);
    if (picker) this.startClock(picker.id, this.options.pickTimeoutMs, () => this.pickForAbsentee(picker.id));
  }

  private startClock(playerId: PlayerId, totalMs: number, onExpire: () => void): void {
    this.clockFrom = { playerId, startedAt: this.options.now(), totalMs };
    this.turnTimer = this.options.setTimer(() => {
      this.turnTimer = null;
      onExpire();
    }, totalMs);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer !== null) this.options.clearTimer(this.turnTimer);
    this.turnTimer = null;
    this.clockFrom = null;
  }

  /**
   * Move on behalf of somebody who has stopped answering.
   *
   * Passing where passing is legal, because it is the least committal thing
   * that can be done with somebody else's hand — it spends nothing. Where
   * passing is not legal the turn cannot be skipped, so the first legal move
   * goes down: playing *something* badly is the only alternative to the table
   * never moving again, and a person who has walked away is not owed a good
   * move so much as the other three are owed a game.
   */
  private playForAbsentee(playerId: PlayerId): void {
    const prompt = this.session.promptFor(playerId);
    if (!prompt) return;
    if (prompt.canPass) this.session.submitMove(playerId, { kind: 'PASS' });
    else if (prompt.legalMoves[0]) this.session.submitMove(playerId, { kind: 'PLAY', combo: prompt.legalMoves[0] });
  }

  /**
   * Pick a pile for somebody who did not. The piles are blind, so any remaining
   * pile is as good as the one they would have chosen — nothing is lost but the
   * click.
   */
  private pickForAbsentee(playerId: PlayerId): void {
    this.clearTurnTimer();
    const ceremony = this.session.ceremony();
    if (ceremony.kind !== 'picking' || ceremony.picker !== playerId || ceremony.remaining.length === 0) return;
    const pile = ceremony.remaining[Math.floor(Math.random() * ceremony.remaining.length)]!;
    this.session.claimPile(playerId, pile);
  }

  private seatOfConnection(connection: Connection): Occupancy | undefined {
    return this.occupancy.find((o) => o.connection === connection);
  }
}
