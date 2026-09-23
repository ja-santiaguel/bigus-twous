import {
  cardId,
  createNewRound,
  createRng,
  dealPiles,
  getTurnOptions,
  playTurn,
  applyPass,
  applyPlay,
  toPlayerView,
  type Card,
  type GameState,
  type Move,
  type PileClaim,
  type Player,
  type PlayerId,
  type PlayerView,
  type TurnOptions,
} from '@big-two/engine';
import { createCpuPlayer } from '@big-two/ai';
import type {
  CeremonyState,
  GameSession,
  MatchState,
  RoundRecord,
  Occupant,
  SeatConfig,
  SessionEvent,
  SessionOptions,
  SessionSave,
  SubmitResult,
  TurnPrompt,
} from './types.js';
import { decideMatch, DEFAULT_MATCH, isMatchRule } from './match.js';

/**
 * A table, run by somebody other than the screen showing it.
 *
 * This is the authority. It owns the one true `GameState`, advances it through
 * the engine's `playTurn`, and hands out only `toPlayerView` redactions — so a
 * consumer is not trusted not to peek, it is *unable* to. Intents come in
 * (`submitMove`, `claimPile`), the engine validates them, and a new state goes
 * back out as events.
 *
 * The point of extracting it is that this is the half that moves to a server.
 * Running it in the same process as the UI is a deployment detail, not an
 * architecture: the boundary either holds when the two are inches apart or it
 * was never real. Everything the client used to reach for — the full state,
 * the loop, the ceremony, the other three hands — is on this side of it now.
 *
 * Deliberately *not* here: screens, animation, sorting, selection, speed
 * preferences. A pause between turns is presentation, so the pacer is injected
 * rather than owned.
 */

/** A seat, plus the parked promise that is its turn when a person holds it. */
interface Seat {
  config: SeatConfig;
  player: Player;
  resolve: ((move: Move) => void) | null;
  reject: ((reason: Error) => void) | null;
}

export function createGameSession(options: SessionOptions): GameSession {
  const listeners = new Set<(event: SessionEvent) => void>();
  const pace = options.pacer ?? (async () => {});
  let seed = options.resume?.seed ?? options.seed;
  /**
   * Everything random that is *not* the deal: pick order, computer picks.
   *
   * The deal used to draw from this same stream, after the pick order had
   * already taken from it — and the pick order shuffles people and computers
   * separately, so how much it took depended on how many people were seated.
   * The same seed therefore dealt different cards alone and at a shared
   * table. The deal now has a stream of its own (see `runRound`).
   */
  // A resumed table cannot rewind the stream to where the save left it, so it
  // starts a fresh one keyed to the point it resumed from. A continued match
  // was never reproducible from its seed anyway: a person's picks are not in it.
  let rng = createRng(options.resume ? `${seed}:resume:${options.resume.state.history.length}` : seed);

  const seats: Seat[] = options.seats.map(buildSeat);
  let state: GameState | null = options.resume?.state ?? null;
  let record: RoundRecord | null = null;
  let ceremony: CeremonyState = { kind: 'idle' };
  let piles: Card[][] = [];
  let roundNumber = options.resume?.roundNumber ?? 0;
  let previousWinner: PlayerId | null = options.resume?.previousWinner ?? null;
  let pickResolver: ((pileIndex: number | null) => void) | null = null;
  let pendingPicker: PlayerId | null = null;
  /**
   * Guards an abandoned loop against writing into a live one. Every `await`
   * below is a point where the table could have been disposed, or a new round
   * started underneath it.
   */
  let token = 0;
  let disposed = false;
  /** The next `start` carries on the saved round rather than dealing a new one. */
  let resumePending = options.resume !== undefined;
  let match: MatchState = options.resume?.match ?? { rule: options.match ?? DEFAULT_MATCH, winner: null };
  /**
   * Which match this is at the table. A rematch on the same seed would
   * otherwise deal the first match's cards again, round for round; the first
   * match keeps exactly the stream it always had.
   */
  let matchIndex = options.resume?.matchIndex ?? 0;

  function buildSeat(config: SeatConfig): Seat {
    const seat: Seat = { config, player: undefined as unknown as Player, resolve: null, reject: null };
    seat.player = makePlayer(seat);
    return seat;
  }

  /**
   * One `Player` per seat, whatever is behind it.
   *
   * A CPU resolves its promise by computing; a person resolves it by
   * submitting. The orchestrator cannot tell the difference and never asks,
   * which is why a socket can be added later without the engine noticing.
   *
   * Reading `config.occupant` at call time rather than capturing it is what
   * lets a seat change hands mid-round: a dropped player becomes a computer
   * between one turn and the next.
   */
  function makePlayer(seat: Seat): Player {
    return {
      id: seat.config.id,
      getMove(view, legalMoves, canPass) {
        const occupant = seat.config.occupant;
        if (occupant.kind === 'cpu') {
          return createCpuPlayer(seat.config.id, occupant.difficulty).getMove(view, legalMoves, canPass);
        }
        return new Promise<Move>((resolve, reject) => {
          seat.resolve = resolve;
          seat.reject = reject;
        });
      },
    };
  }

  const emit = (event: SessionEvent) => {
    for (const listener of [...listeners]) listener(event);
  };

  const seatOf = (id: PlayerId) => seats.find((s) => s.config.id === id) ?? null;
  const playerMap = () => new Map(seats.map((s) => [s.config.id, s.player] as const));

  /** The seat whose turn it is, or null between rounds. */
  const currentSeatId = (): PlayerId | null =>
    state && state.phase !== 'ROUND_END' ? state.players[state.turnIndex]!.id : null;

  // ── The loop ──────────────────────────────────────────────────────────

  /**
   * Deals piles, runs the ceremony, builds the round, then plays it out.
   *
   * The ceremony cannot be folded into the engine: a claim is a *decision*, and
   * the round does not exist until all four are in. The engine still owns the
   * outcome — it validates the claims and deals the hands from them.
   */
  async function runRound(myToken: number) {
    // Seats sitting this round out pick nothing and are dealt nothing.
    const out = new Set(options.sittingOut?.() ?? []);
    const playing = seats.filter((s) => !out.has(s.config.id));
    const order = pickOrder().filter((id) => !out.has(id));
    // Its own stream, keyed on the seed and the round alone, so the same seed
    // deals the same four piles whoever is sitting at the table.
    const stream = matchIndex === 0 ? seed : `${seed}:match:${matchIndex}`;
    const remaining = seats.map((_, index) => index);
    const claims: PileClaim[] = [];

    for (const picker of order) {
      const seat = seatOf(picker);
      if (!seat) continue;
      ceremony = { kind: 'picking', claims: [...claims], remaining: [...remaining], picker };
      emit({ type: 'CEREMONY', ceremony });

      let pileIndex: number;
      if (seat.config.occupant.kind === 'human') {
        pendingPicker = picker;
        const chosen = await new Promise<number | null>((resolve) => {
          pickResolver = resolve;
        });
        pendingPicker = null;
        if (chosen === null || myToken !== token) return;
        pileIndex = chosen;
      } else {
        await pace('pick');
        if (myToken !== token) return;
        // Blind, so a computer's pick is a uniform draw. There is nothing to be
        // clever about — that is the entire point of dealing them face down.
        pileIndex = remaining[Math.floor(rng() * remaining.length)]!;
      }

      remaining.splice(remaining.indexOf(pileIndex), 1);
      claims.push({ playerId: picker, pileIndex, pickIndex: claims.length });
    }

    if (myToken !== token) return;

    // Piles left over are set aside for the seats sitting out, one each, and
    // shown so before the round begins.
    if (remaining.length > 0 && out.size > 0) {
      const absent = seats.filter((s) => out.has(s.config.id)).map((s) => s.config.id);
      const setAside = remaining.map((pileIndex, i) => ({ pileIndex, playerId: absent[i % absent.length]! }));
      ceremony = { kind: 'picking', claims: [...claims], remaining: [...remaining], picker: null, setAside };
      emit({ type: 'CEREMONY', ceremony });
      await pace('pick');
      await pace('pick');
      if (myToken !== token) return;
    }

    // Dealt only now, once every pile is claimed. The picks are blind either
    // way, but dealing after them is what lets a fair table (9.18) settle the
    // shuffle when nobody can pick with the cards in view — the host included.
    // The default seed is the same stream as always, so an ordinary table
    // deals exactly what it did.
    let dealSeed: string;
    try {
      dealSeed = options.dealSeed ? await options.dealSeed(roundNumber + 1) : stream + ':deal:' + (roundNumber + 1);
    } catch {
      return;
    }
    if (myToken !== token) return;
    piles = dealPiles(seats.length, createRng(dealSeed));

    roundNumber += 1;
    const ids = playing.map((s) => s.config.id);
    record = {
      roundNumber,
      seats: ids,
      previousWinner,
      roundsWon: state?.roundsWon ?? {},
      points: state ? state.points : null,
      claims: [...claims],
      dealSeed,
    };
    state = createNewRound(ids, rng, stream + ':' + roundNumber, roundNumber, previousWinner, record.roundsWon, {
      piles,
      claims,
      seats: playing.map((s) => s.config.seat),
      ...(state ? { points: state.points } : {}),
    });
    ceremony = { kind: 'idle' };
    emit({ type: 'CEREMONY', ceremony });
    emit({ type: 'ROUND_STARTED', roundNumber });

    await runTurns(myToken);
  }

  async function runTurns(myToken: number) {
    for (;;) {
      const current = state;
      if (!current || current.phase === 'ROUND_END' || myToken !== token) return;

      const actor = current.players[current.turnIndex]!;
      const isCpu = seatOf(actor.id)?.config.occupant.kind === 'cpu';

      let next: GameState;
      try {
        next = options.turnOptions
          ? await playTurnWith(current, playerMap(), options.turnOptions)
          : await playTurn(current, playerMap());
      } catch (err) {
        if (myToken !== token) return; // disposed or handed over mid-turn
        emit({ type: 'FAILED', message: err instanceof Error ? err.message : String(err) });
        return;
      }
      if (myToken !== token) return;

      // A computer's think time, spent before anyone is shown what it decided.
      // Pausing afterwards would pace the *next* seat, and would leave the seat
      // acting straight after a person with no pause at all.
      if (isCpu) {
        await pace(moveKind(current, next));
        if (myToken !== token) return;
      }

      const appended = next.history.slice(current.history.length);
      state = next;
      emit({ type: 'TURN', events: appended });

      if (next.phase === 'ROUND_END') {
        previousWinner = next.winnerOfRound;
        // Decided before the round's end is announced, so the snapshot that
        // shows the scores already knows whether they finished the match.
        const matchWinner = decideMatch(
          match.rule,
          next,
          seats.map((s) => s.config.id),
        );
        if (matchWinner) match = { ...match, winner: matchWinner };
        emit({
          type: 'ROUND_ENDED',
          winner: next.winnerOfRound ?? seats[0]!.config.id,
          points: next.points,
        });
        if (matchWinner) emit({ type: 'MATCH_ENDED', winner: matchWinner });
        return;
      }
    }
  }

  /**
   * Who picks a pile first, and in what order.
   *
   * On the opening round the order is randomised between *people*, with
   * computers last — a blind pick is pure luck, and making a person sit
   * through three of them before their own is the dullest possible way to
   * start a game. After that the previous round's winner picks first, whoever
   * they are, because that is the reward the rules attach to winning.
   */
  function pickOrder(): PlayerId[] {
    const ids = seats.map((s) => s.config.id);
    if (previousWinner) {
      const start = ids.indexOf(previousWinner);
      return start === -1 ? ids : [...ids.slice(start), ...ids.slice(0, start)];
    }
    const humans = shuffle(seats.filter((s) => s.config.occupant.kind === 'human').map((s) => s.config.id));
    const cpus = shuffle(seats.filter((s) => s.config.occupant.kind === 'cpu').map((s) => s.config.id));
    return [...humans, ...cpus];
  }

  function shuffle<T>(items: T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const swap = out[i]!;
      out[i] = out[j]!;
      out[j] = swap;
    }
    return out;
  }

  // ── The surface ───────────────────────────────────────────────────────

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    viewFor(playerId): PlayerView | null {
      // A seat sitting the round out has no hand to see.
      if (!state || !seatOf(playerId) || !state.players.some((p) => p.id === playerId)) return null;
      return toPlayerView(state, playerId);
    },

    promptFor(playerId): TurnPrompt | null {
      if (!state || state.phase === 'ROUND_END') return null;
      if (currentSeatId() !== playerId) return null;
      const turn = (options.turnOptions ?? getTurnOptions)(state);
      return {
        playerId,
        legalMoves: turn.legalMoves,
        canPass: turn.canPass,
        constraint: turn.constraint,
      };
    },

    ceremony: () => ceremony,
    seats: () => seats.map((s) => s.config),
    pileCount: () => seats.length,
    seed: () => seed,
    match: () => match,
    roundRecord: () => record,

    setMatch(rule): SubmitResult {
      if (!isMatchRule(rule)) return { ok: false, reason: 'That is not a match length.' };
      if (roundNumber > 0 || ceremony.kind !== 'idle') {
        return { ok: false, reason: 'The match length is fixed once the first round is dealt.' };
      }
      match = { rule, winner: null };
      return { ok: true };
    },

    save(): SessionSave | null {
      // Between turns the state is always whole: a turn in flight has not
      // been committed, so a save taken during one is the table just before it.
      if (!state) return null;
      return { version: 1, seed, roundNumber, previousWinner, state, match, matchIndex };
    },

    /**
     * Change the seed, while nothing has been dealt from it.
     *
     * Once a ceremony has begun the piles exist, and a seed that changed
     * afterwards would describe a deal that never happened.
     */
    reseed(next): SubmitResult {
      if (roundNumber > 0 || ceremony.kind !== 'idle') {
        return { ok: false, reason: 'The seed is fixed once the first round is dealt.' };
      }
      seed = next;
      rng = createRng(next);
      return { ok: true };
    },

    /**
     * A move from a seat.
     *
     * The engine re-validates the move itself inside `playTurn`; these checks
     * only catch what would otherwise resolve the *wrong* seat's promise,
     * which no amount of rule checking downstream would notice.
     */
    submitMove(playerId, move): SubmitResult {
      const seat = seatOf(playerId);
      if (!seat) return { ok: false, reason: 'No such seat at this table.' };
      if (currentSeatId() !== playerId) return { ok: false, reason: 'It is not your turn.' };
      const resolve = seat.resolve;
      if (!resolve) return { ok: false, reason: 'This seat is not waiting on a move.' };
      seat.resolve = null;
      seat.reject = null;
      resolve(move);
      return { ok: true };
    },

    /**
     * Resolve a set of cards against what this seat may actually play.
     *
     * Matching by card identity against the precomputed legal set means the
     * combo that reaches the engine is one the engine itself produced — the
     * caller chooses *which* of their legal moves to make, and cannot invent
     * one. A set that matches nothing is refused here rather than throwing out
     * of the orchestrator, because "those cards are not a move you have" is a
     * normal thing for a person to try, not a protocol violation.
     */
    submitPlay(playerId, cards): SubmitResult {
      const prompt = this.promptFor(playerId);
      if (!prompt) return { ok: false, reason: 'It is not your turn.' };
      const wanted = key(cards);
      const combo = prompt.legalMoves.find((move) => key(move.cards) === wanted);
      if (!combo) return { ok: false, reason: 'Those cards are not a legal play.' };
      return this.submitMove(playerId, { kind: 'PLAY', combo });
    },

    claimPile(playerId, pileIndex): SubmitResult {
      if (ceremony.kind !== 'picking') return { ok: false, reason: 'No pile selection in progress.' };
      if (pendingPicker !== playerId) return { ok: false, reason: 'It is not your pick.' };
      if (!ceremony.remaining.includes(pileIndex)) return { ok: false, reason: 'That pile is already taken.' };
      const resolve = pickResolver;
      if (!resolve) return { ok: false, reason: 'Not waiting on a pick.' };
      pickResolver = null;
      resolve(pileIndex);
      return { ok: true };
    },

    /**
     * Hand a seat over, mid-round if need be.
     *
     * The `Player` reads its occupant when asked for a move, so the next turn
     * simply goes to whoever is behind the seat by then. A person dropping
     * mid-turn is the one case needing a nudge: their promise is already
     * parked, so rejecting it unwinds the loop, and the turn is retaken on the
     * same state — which now resolves through the computer instead.
     */
    setOccupant(playerId, occupant: Occupant) {
      const seat = seatOf(playerId);
      if (!seat) return;
      const wasWaiting = seat.resolve !== null;
      seat.config = { ...seat.config, occupant };
      emit({ type: 'SEATS', seats: seats.map((s) => s.config) });

      if (wasWaiting && occupant.kind === 'cpu') {
        const reject = seat.reject;
        seat.resolve = null;
        seat.reject = null;
        reject?.(new Error('Seat handed over'));
        const myToken = ++token;
        void runTurns(myToken);
      }
    },

    start() {
      if (disposed) return;
      if (resumePending) {
        resumePending = false;
        // A round saved mid-play carries on from the turn it stopped on. One
        // saved finished waits for this call like any other, and deals next.
        if (state && state.phase !== 'ROUND_END') {
          const myToken = ++token;
          emit({ type: 'ROUND_STARTED', roundNumber });
          void runTurns(myToken);
          return;
        }
      }
      if (match.winner) {
        // The match is decided, so this starts the next one: points, round
        // count and the pick order all begin again, on a fresh deal stream.
        match = { ...match, winner: null };
        matchIndex += 1;
        state = null;
        roundNumber = 0;
        previousWinner = null;
        rng = createRng(`${seed}:match:${matchIndex}`);
      }
      void runRound(++token);
    },

    startNextRound() {
      this.start();
    },

    dispose() {
      disposed = true;
      token++;
      pickResolver?.(null);
      pickResolver = null;
      for (const seat of seats) {
        const reject = seat.reject;
        seat.resolve = null;
        seat.reject = null;
        reject?.(new Error('Table closed'));
      }
      listeners.clear();
    },
  };
}

/**
 * What the actor just did, read from the events their turn appended.
 *
 * A single turn can append more than one event — a pass that closes a trick
 * also appends the reset, and a winning play appends a finish — so this scans
 * the turn's own events rather than taking the last thing in the log, which is
 * frequently the consequence rather than the act.
 */
function moveKind(before: GameState, after: GameState): 'play' | 'pass' {
  for (const event of after.history.slice(before.history.length)) {
    if (event.type === 'CARDS_PLAYED') return 'play';
    if (event.type === 'PLAYER_PASSED') return 'pass';
  }
  return 'play';
}

/** Order-independent identity for a set of cards. */
function key(cards: { rank: string; suit: string }[]): string {
  return cards
    .map((c) => cardId(c as never))
    .sort()
    .join('|');
}

/**
 * The engine's `playTurn`, with the turn's options supplied by the table
 * rather than the base rules. Used only when a session is given
 * `turnOptions`; the base game goes through the engine's own `playTurn`
 * untouched. The same checks, in the same order: a pass must be allowed, a
 * play must be one of the legal moves, matched by card identity.
 */
async function playTurnWith(
  state: GameState,
  players: Map<string, Player>,
  turnOptions: (state: GameState) => TurnOptions,
): Promise<GameState> {
  const actor = state.players[state.turnIndex]!;
  const player = players.get(actor.id);
  if (!player) throw new Error(`No Player implementation registered for ${actor.id}`);
  const { legalMoves, canPass } = turnOptions(state);
  const move = await player.getMove(toPlayerView(state, actor.id), legalMoves, canPass);
  if (move.kind === 'PASS') {
    if (!canPass) throw new Error(`${actor.id} attempted to pass when passing was not legal.`);
    return applyPass(state, actor.id);
  }
  const wanted = key(move.combo.cards);
  const legal = legalMoves.find((combo) => combo.type === move.combo.type && key(combo.cards) === wanted);
  if (!legal) throw new Error(`${actor.id} attempted an illegal move: ${JSON.stringify(move.combo)}`);
  return applyPlay(state, actor.id, legal);
}
