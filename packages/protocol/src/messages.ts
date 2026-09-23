import type { Card, Combo, GameEvent, PileClaim, PlayerId, PlayerView, TurnConstraint } from '@big-two/engine';

/**
 * The wire vocabulary.
 *
 * What a client may say to a table, and what a table says back. This package
 * describes messages and nothing else: it has no session, no socket and no
 * rules, which is why both ends can depend on it without either depending on
 * the other.
 *
 * Two principles shape everything below.
 *
 * **Nothing derived goes on the wire from a client.** A `Combo` carries a type
 * and a comparable value worked out from its cards — so accepting one from a
 * client is accepting its claim about what those cards amount to. Clients send
 * *cards*; the authority draws the conclusion. Server-to-client messages do
 * carry full combos, because by then they are facts the server established.
 *
 * **Every outbound message is a complete answer.** A `SYNC` says what this seat
 * should now see, in full, rather than a patch to be applied to whatever the
 * client had. A client that misses one is not corrupted, only briefly stale,
 * and reconnecting is the same code path as connecting. The appended `events`
 * ride along purely so the screen can animate what just happened — they are a
 * convenience, never the source of truth.
 */

/** Bumped when a change would make an old client misread a message. */
export const PROTOCOL_VERSION = 1;

/** A table code from a shared link. Short, unambiguous, not secret. */
export type TableCode = string;

/**
 * How a returning player proves they are the same person.
 *
 * Not an account and not a password — a random string the server handed out on
 * join, held by that browser, good for reclaiming that seat at that table
 * until it closes. Anyone who has it can take the seat, which is the same
 * property the table link itself has.
 */
export type SeatToken = string;

// ── Client → server ──────────────────────────────────────────────────────

/**
 * A move, as a client is allowed to express it.
 *
 * `cards` rather than a combo, deliberately — see the note at the top. A set
 * that is not one of this seat's legal moves is refused, which is a normal
 * answer rather than an error: people mis-select all the time.
 */
export type WireMove = { kind: 'PLAY'; cards: Card[] } | { kind: 'PASS' };

export type ClientMessage =
  /** Take a seat, or reclaim one with the token from a previous visit. */
  | { type: 'JOIN'; table: TableCode; name?: string; token?: SeatToken }
  | { type: 'CLAIM_PILE'; pileIndex: number }
  /**
   * Change what the table calls you.
   *
   * Separate from `JOIN` because joining must never wait on it. Somebody
   * following a shared link has already decided to play, and a name typed at
   * the door cannot be corrected once three friends are watching — so the name
   * is set from inside the room, where you can see who else is there.
   */
  | { type: 'SET_NAME'; name: string }
  /**
   * Move to a seat nobody has sat in, before the first deal.
   *
   * Seats decide who you sit beside and who plays straight after you, which
   * is a real choice at a shared table. It closes once the first round is
   * dealt: moving between rounds would carry another seat's score with you.
   */
  | { type: 'TAKE_SEAT'; seat: number }
  /** Change the table's seed, before the first deal. */
  | { type: 'SET_SEED'; seed: string }
  /** Set how a computer plays an empty seat, before the first deal. */
  | { type: 'SET_DIFFICULTY'; seat: number; difficulty: WireDifficulty }
  /**
   * Remove a person from the table, before the first deal. Host only.
   *
   * Their seat goes back to a computer and their token stops working. The
   * link still works for them — without accounts there is nobody to ban,
   * only a seat to clear.
   */
  | { type: 'KICK'; seat: number }
  /** Set how long the match runs, before the first deal. Host only. */
  | { type: 'SET_MATCH'; rule: WireMatchRule }
  /**
   * Turn the turn clock on or off, before the first deal. Host only. With it
   * off nobody is hurried — a table of friends in one room has no need of it —
   * and nobody is played for when they are slow.
   */
  | { type: 'SET_TURN_TIMER'; on: boolean }
  /** This seat's random share of the next deal's shuffle, answering DEAL_COMMIT (9.18). */
  | { type: 'DEAL_SHARE'; round: number; share: string }
  | { type: 'PLAY'; move: WireMove }
  /**
   * Ask for the current picture again. A client sends this on reconnect, or
   * when a `seq` gap tells it that it missed something.
   */
  | { type: 'RESYNC' }
  /**
   * Ready for the next round. The table starts one when the seats agree, or
   * when the countdown between rounds runs out. From a seat a computer is
   * standing in for, it takes the seat back.
   */
  | { type: 'READY' }
  /** Take back a READY: in the lobby, or between rounds until the next deal. */
  | { type: 'UNREADY' }
  /** Start the game. Host only, before the first deal, once every other person is ready. */
  | { type: 'START' }
  | { type: 'LEAVE' };

/** A client message plus the envelope every inbound message carries. */
export interface ClientEnvelope {
  v: number;
  /** Echoed back on a rejection so a client knows which intent failed. */
  id?: string;
  message: ClientMessage;
}

// ── Server → client ──────────────────────────────────────────────────────

/**
 * How long a match runs. Restated from `@big-two/session`, like the menu of
 * accepted values below; the protocol tests hold the two together.
 */
export type WireMatchRule = { kind: 'points'; target: number } | { kind: 'rounds'; count: number };
export const WIRE_MATCH_POINT_TARGETS = [15, 30, 50] as const;
export const WIRE_MATCH_ROUND_COUNTS = [5, 10] as const;

/** The match rule, and its winner once decided. */
export interface WireMatch {
  rule: WireMatchRule;
  winner: PlayerId | null;
}

/**
 * A round's full record at a table hosted in a player's browser (9.18), sent to
 * every seat when the round ends so each can check it. Restated from
 * `@big-two/session`'s RoundAudit; see the protocol tests.
 */
export interface WireRoundAudit {
  roundNumber: number;
  commit: string;
  hostSecret: string;
  shares: Record<PlayerId, string>;
  dealSeed: string;
  seats: PlayerId[];
  previousWinner: PlayerId | null;
  roundsWon: Record<PlayerId, number>;
  points: Record<PlayerId, number> | null;
  claims: PileClaim[];
  history: GameEvent[];
}

/** How a computer plays a seat. Restated from `@big-two/ai`; see the protocol tests. */
export type WireDifficulty = 'easy' | 'medium' | 'hard';

/** A seat as everyone at the table may see it. Never carries cards. */
export interface WireSeat {
  id: PlayerId;
  seat: number;
  name: string;
  /**
   * What is playing this seat right now.
   *
   * `away` is a person who has dropped and whose seat a computer is covering
   * until they come back — distinct from `cpu`, which is a seat that was never
   * anybody's. The difference matters at the table: one is a chair somebody
   * will return to, the other is a chair nobody is coming to.
   */
  occupant: 'human' | 'cpu' | 'away';
  connected: boolean;
  /** How a computer plays this seat whenever one is covering it. */
  difficulty: WireDifficulty;
  /** Has said yes to the next round. */
  ready: boolean;
  /** Runs the lobby: the connected person who has been at the table longest. */
  host: boolean;
  /**
   * Connected, but a computer is playing for them — they were not ready when
   * the countdown between rounds ran out. `READY` takes the seat back.
   */
  standIn: boolean;
}

/** A countdown, sent as time remaining for the same reason as `WireClock`. */
export interface WireCountdown {
  remainingMs: number;
  totalMs: number;
}

/**
 * Whose turn is on the clock, and how much of it is left.
 *
 * Sent as *remaining milliseconds at the moment this message was built*, not
 * as a deadline. A deadline is a point on the server's clock, and the client's
 * clock is not the server's — a phone a few seconds out would show a countdown
 * that is confidently wrong. A duration needs no agreement about what time it
 * is, and every snapshot resets whatever drift has crept in.
 *
 * Null when nothing is on a clock: between rounds, during the ceremony, and on
 * a table with the timer switched off.
 */
export interface WireClock {
  playerId: PlayerId;
  remainingMs: number;
  /** The full allowance, so a client can show how much of it has gone. */
  totalMs: number;
}

/** The pile ceremony, as a seat sees it. Blind: claims carry no card data. */
export type WireCeremony =
  | { kind: 'idle' }
  | {
      kind: 'picking';
      claims: PileClaim[];
      remaining: number[];
      picker: PlayerId | null;
      /** Piles set aside for seats sitting the round out, once everyone dealt in has picked. */
      setAside?: { pileIndex: number; playerId: PlayerId }[];
    };

/**
 * What this seat may do, sent only to the seat on turn.
 *
 * The legal moves come down the wire rather than being worked out again by the
 * client, because a client that derives the rules is a client that can disagree
 * with the server — and it is the disagreement, not the wrong answer, that is
 * unfixable at three in the morning.
 */
export interface WirePrompt {
  playerId: PlayerId;
  legalMoves: Combo[];
  canPass: boolean;
  constraint: TurnConstraint;
}

export type ServerMessage =
  /** First message after a successful join. The token is worth keeping. */
  | { type: 'WELCOME'; you: PlayerId; table: TableCode; token: SeatToken; version: number }
  /**
   * Everything this seat should currently see. Complete, not a patch.
   * `events` are the engine events appended since the previous SYNC, for
   * animation only.
   */
  | {
      type: 'SYNC';
      seq: number;
      view: PlayerView | null;
      prompt: WirePrompt | null;
      ceremony: WireCeremony;
      seats: WireSeat[];
      events: GameEvent[];
      clock: WireClock | null;
      /** Time until the next round deals regardless. Null unless one is counting down. */
      nextRound: WireCountdown | null;
      /** How long the match runs, and who won it once it is decided. */
      match: WireMatch;
      /** Whether people are on a clock: the host's call, before the first deal. */
      turnTimer: boolean;
      /** The table's seed. The same format, and the same deal, as a seed used alone. */
      seed: string;
    }
  /** A fair table sealing the next deal: the hash of the host's part of the shuffle (9.18). */
  | { type: 'DEAL_COMMIT'; round: number; commit: string }
  /** A fair table's full record of the round that just ended, for every seat to check. */
  | { type: 'ROUND_AUDIT'; audit: WireRoundAudit }
  /** An intent was not accepted, with the reason a person could be shown. */
  | { type: 'REJECTED'; id?: string; reason: string }
  /** The table is gone: closed, finished, or fallen over. */
  | { type: 'CLOSED'; reason: string };

export interface ServerEnvelope {
  v: number;
  message: ServerMessage;
}
