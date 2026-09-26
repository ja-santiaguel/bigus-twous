import type {
  TurnOptions,
  Card,
  Combo,
  GameEvent,
  GameState,
  Move,
  PileClaim,
  PlayerId,
  PlayerView,
  TurnConstraint,
} from '@big-two/engine';
import type { Difficulty } from '@big-two/ai';

/**
 * What a session is, in types.
 *
 * Everything here is the vocabulary of *a table that somebody else is running*
 * — which is what a session is even when it happens to be running in the same
 * process as the screen showing it. A consumer of this package can see its own
 * view, be told when something changed, and submit an intent. It cannot see
 * another seat's hand, and it cannot advance the game itself.
 */

/**
 * The four seats, in engine order.
 *
 * One definition, because there were three — the app, the server and the
 * simulator each had their own, and two of them disagreed about whether the
 * numbering starts at zero. Nothing caught it: a client looking its own id up
 * in the wrong list found a match one seat along, so it drew somebody else's
 * fan as its own hand. Seat identity is the session's to define, since the
 * session is the thing that deals to them.
 */
export const SEAT_IDS: PlayerId[] = ['seat-1', 'seat-2', 'seat-3', 'seat-4'];

/** How a seat is being played right now. */
export type Occupant =
  /** A person, local or remote. The session parks their turn until they submit. */
  | { kind: 'human' }
  /**
   * A computer. Used for practice seats and, once there is a network, for a
   * seat whose person has dropped — a table of four does not stop because one
   * connection did.
   */
  | { kind: 'cpu'; difficulty: Difficulty };

/** How long a match runs (9.17). The accepted values are in `match.ts`. */
export type MatchRule = { kind: 'points'; target: number } | { kind: 'rounds'; count: number };

/** The match rule, and its winner once the match is decided. */
export interface MatchState {
  rule: MatchRule;
  winner: PlayerId | null;
}

/** How the current round was set up: everything needed to rebuild its deal (9.18). */
export interface RoundRecord {
  roundNumber: number;
  /** Seat ids in engine order. */
  seats: PlayerId[];
  previousWinner: PlayerId | null;
  /** Standings carried into the round, before it was scored. */
  roundsWon: Record<PlayerId, number>;
  points: Record<PlayerId, number> | null;
  claims: PileClaim[];
  /** What the piles were dealt from. */
  dealSeed: string;
}

export interface SeatConfig {
  id: PlayerId;
  /** Seat index in engine order. Screen position is a client concern. */
  seat: number;
  occupant: Occupant;
}

/**
 * The pile-selection ceremony (9.13), which runs before a round exists.
 *
 * The piles are dealt before the round is built, because nobody can claim a
 * pile that has not been dealt — so the session deals, collects four claims,
 * and only then asks the engine to construct the round from them.
 */
export type CeremonyState =
  | { kind: 'idle' }
  | {
      kind: 'picking';
      /** Claims settled so far, in pick order. Blind — no card data. */
      claims: PileClaim[];
      /** Pile indexes still unclaimed. */
      remaining: number[];
      /** Seat currently choosing, or null during the beat between picks. */
      picker: PlayerId | null;
      /**
       * Piles nobody will pick, once every seat dealt in has picked: each set
       * aside for a seat sitting the round out (see `sittingOut`).
       */
      setAside?: { pileIndex: number; playerId: PlayerId }[];
    };

/** What a seat may do on its turn. Sent only to the seat whose turn it is. */
export interface TurnPrompt {
  playerId: PlayerId;
  legalMoves: Combo[];
  canPass: boolean;
  constraint: TurnConstraint;
}

/**
 * Something changed. Deliberately thin: an event says *that* the table moved,
 * not what every seat should now see. Each consumer pulls its own view, which
 * is exactly what a server does when it fans an update out to four sockets.
 */
export type SessionEvent =
  | { type: 'CEREMONY'; ceremony: CeremonyState }
  | { type: 'ROUND_STARTED'; roundNumber: number }
  /** The table advanced. `events` are the engine events this turn appended. */
  | { type: 'TURN'; events: GameEvent[] }
  | { type: 'ROUND_ENDED'; winner: PlayerId; points: Record<PlayerId, number> }
  /** The round that just ended decided the match. Sent straight after ROUND_ENDED. */
  | { type: 'MATCH_ENDED'; winner: PlayerId }
  | { type: 'SEATS'; seats: SeatConfig[] }
  /** The session could not continue. Terminal. */
  | { type: 'FAILED'; message: string };

/** The answer to an intent. Rejections are explained, never silent. */
export type SubmitResult = { ok: true } | { ok: false; reason: string };

/**
 * Presentation pacing, injected rather than owned.
 *
 * A pause between turns is not a rule, and the authority has no opinion about
 * how fast somebody wants to watch. A local game passes the player's speed
 * preference; a server passes its own fixed pacing, because four clients have
 * to see the same table at the same time; a test passes nothing at all and the
 * round resolves as fast as it can.
 */
export type Pacer = (kind: 'play' | 'pass' | 'pick') => Promise<void>;

export interface SessionOptions {
  seats: SeatConfig[];
  /** Seeds the deal. The same seed deals the same cards. */
  seed: string;
  pacer?: Pacer;
  /**
   * Pick up a table from a save instead of starting fresh. The seats must be
   * the same seats the save was made with; the seed comes from the save.
   */
  resume?: SessionSave;
  /** How long the match runs. First to 30 points if not given. */
  match?: MatchRule;
  /**
   * Where each round's deal comes from, asked once every pile has been
   * claimed. By default the table seed and the round; a table hosted in a
   * player's browser settles it from everyone's shuffle instead (9.18).
   */
  dealSeed?: (roundNumber: number) => string | Promise<string>;
  /**
   * What the seat whose turn it is may do. The base game's rules when not
   * given (the engine's `getTurnOptions`). A variant table — the campaign,
   * where a class's passive lets a seat make a beat the base rules do not —
   * supplies its own, and the turn loop validates every move against it.
   */
  turnOptions?: (state: GameState) => TurnOptions;
  /**
   * Seats that sit the next round out, asked as each round begins: they pick
   * no pile, hold no cards and take no turns, and keep their chair. The piles
   * they would have picked are set aside unplayed. A campaign table, where a
   * player who goes broke stays out, is the one user; every seat plays when
   * not given.
   */
  sittingOut?: () => PlayerId[];
  /**
   * Pick piles in the order the last round finished — its winner first, then
   * second place, third, and last — rather than clockwise from the winner
   * (9.13). A campaign table's rule; the base game leaves it off. The opening
   * round is unchanged either way.
   */
  pickByPlacing?: boolean;
}

/**
 * Everything needed to carry on a table later: the full state, and the few
 * facts about the match that live outside it.
 *
 * Plain data, so it survives a round trip through JSON. It holds every hand,
 * which is why only a table running in the player's own tab ever makes one —
 * a server never ships this to a client.
 */
export interface SessionSave {
  version: 1;
  seed: string;
  roundNumber: number;
  previousWinner: PlayerId | null;
  state: GameState;
  /** Absent in saves made before matches had an end. */
  match?: MatchState;
  matchIndex?: number;
}

/** Everything a consumer may ask of a table it does not own. */
export interface GameSession {
  subscribe(listener: (event: SessionEvent) => void): () => void;
  /** This seat's redacted view, or null before a round exists. */
  viewFor(playerId: PlayerId): PlayerView | null;
  /** Non-null only while it is this seat's turn. */
  promptFor(playerId: PlayerId): TurnPrompt | null;
  ceremony(): CeremonyState;
  seats(): SeatConfig[];
  /** Piles dealt for the current ceremony — count only; contents stay hidden. */
  pileCount(): number;
  /** The seed this table deals from. */
  seed(): string;
  /** How the current round was set up, or null before the first deal. */
  roundRecord(): RoundRecord | null;
  /** The match rule, and its winner once decided. */
  match(): MatchState;
  /** Change the match rule. Refused once anything has been dealt, or for a rule not on the menu. */
  setMatch(rule: MatchRule): SubmitResult;
  /** A save of this table, or null before anything has been dealt. */
  save(): SessionSave | null;
  /** Change the seed. Refused once anything has been dealt. */
  reseed(seed: string): SubmitResult;
  submitMove(playerId: PlayerId, move: Move): SubmitResult;
  /**
   * Play a set of cards, letting the session work out what they are.
   *
   * The entry point a remote client gets, and the reason it exists: a `Combo`
   * carries a *type* and a *value* derived from its cards, so accepting one
   * off a wire is accepting a claim about what those cards amount to. A client
   * that says four 3s and a 7 are a four-of-a-kind should not be believed, and
   * the cheapest way not to believe it is never to ask. Cards are facts; the
   * combo is a conclusion, and the authority draws it.
   */
  submitPlay(playerId: PlayerId, cards: Card[]): SubmitResult;
  claimPile(playerId: PlayerId, pileIndex: number): SubmitResult;
  /** Hand a seat to a CPU, or give it back to a person who has reconnected. */
  setOccupant(playerId: PlayerId, occupant: Occupant): void;
  start(): void;
  startNextRound(): void;
  /** Stops the loop and rejects anything pending. Idempotent. */
  dispose(): void;
}

/** Re-exported so consumers need one import for the whole vocabulary. */
export type { Card, Combo, GameEvent, GameState, Move, PileClaim, PlayerId, PlayerView, TurnConstraint, TurnOptions };
