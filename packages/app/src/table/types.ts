import type { Card, GameEvent, PlayerId, PlayerView } from '@big-two/engine';
import type {
  WireCeremony,
  WireClock,
  WireCountdown,
  WireDifficulty,
  WireMatch,
  WireMatchRule,
  WirePrompt,
  WireSeat,
} from '@big-two/protocol';

/**
 * A table, from the client's side.
 *
 * One shape, two implementations: a table running in this tab, and a table
 * running somewhere else. The screen cannot tell them apart, which is the
 * point — single-player is not a special case of multiplayer or a separate
 * mode, it is the same game with a shorter wire.
 *
 * Everything is push. Even the local implementation, which could perfectly
 * well be asked questions directly, only ever announces snapshots — because a
 * remote one cannot do otherwise, and an interface shaped around what the
 * easier case allows is an interface that breaks on the harder one.
 */

/** Everything the screen is allowed to know, at one moment. */
export interface TableSnapshot {
  /** This seat's cards and the public record. Null before a round exists. */
  view: PlayerView | null;
  /** Non-null only while this seat is on turn. */
  prompt: WirePrompt | null;
  ceremony: WireCeremony;
  seats: WireSeat[];
  /** The seed this table deals from. */
  seed: string;
  /**
   * Who is on the clock and how long they have left, as of this snapshot.
   *
   * A duration, not a deadline — the client counts down from it locally and
   * every new snapshot corrects whatever drift has crept in. Null on a table
   * with no clock, which includes every local game: there is nobody to keep
   * waiting when the other three seats answer instantly.
   */
  clock: WireClock | null;
  /** Time until a shared table deals the next round regardless. Always null locally. */
  nextRound: WireCountdown | null;
  /** How long the match runs, and who won it once decided. */
  match: WireMatch;
  /** At a table hosted in a browser: whether the last round passed its check (9.18). */
  fairness: Fairness | null;
  /** Which seat we are. Null until the table has told us. */
  you: PlayerId | null;
  /**
   * Engine events appended by the change that produced this snapshot.
   *
   * For animation only — the view above is the truth. A client that missed a
   * snapshot is briefly stale, never wrong, and a resync arrives with this
   * empty because there is nothing to animate about catching up.
   */
  events: GameEvent[];
  /** Increases on every snapshot. A gap means something was missed. */
  seq: number;
  status: ConnectionStatus;
  /**
   * Why the table refused the last thing we asked, if it did.
   *
   * Cleared by the next successful action rather than on a timer, so a
   * rejection stays on screen exactly as long as it is the most recent thing
   * that happened.
   */
  error: string | null;
  /**
   * True while an intent is in flight and the answer has not arrived.
   *
   * Deliberately not optimism. The card layer animates from the view, so a
   * speculative view that turned out to be wrong would fly cards onto the
   * table and drag them back — which is a worse thing to watch than a hundred
   * milliseconds of nothing, and rejections are real: somebody can beat the
   * pile between you choosing a combo and your message arriving.
   */
  pending: boolean;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface TableClient {
  subscribe(listener: (snapshot: TableSnapshot) => void): () => void;
  snapshot(): TableSnapshot;
  /** Play these cards. What they amount to is the table's business, not ours. */
  play(cards: Card[]): void;
  pass(): void;
  claimPile(pileIndex: number): void;
  /** Ready for a round to start, or for the next one. */
  ready(): void;
  /** Take back being ready, before a shared table's game starts. */
  unready(): void;
  /** Start the game: alone, or as a shared table's host. */
  start(): void;
  /** Change what the table calls you. Local tables have nobody to tell. */
  setName(name: string): void;
  /** Change a shared table's seed. A local table's seed is set before it exists. */
  setSeed(seed: string): void;
  /** Set how a computer plays an empty seat at a shared table. */
  setDifficulty(seat: number, difficulty: WireDifficulty): void;
  /** Move to an empty seat at a shared table. Local tables have one seat to sit in. */
  takeSeat(seat: number): void;
  /** Remove a person from a shared table. Host only, before the first deal. */
  kick(seat: number): void;
  /** Set how long a shared table's match runs. Host only. A local table's is set before it exists. */
  setMatch(rule: WireMatchRule): void;
  dispose(): void;
}

export const EMPTY_SNAPSHOT: TableSnapshot = {
  view: null,
  prompt: null,
  ceremony: { kind: 'idle' },
  seats: [],
  seed: '',
  clock: null,
  nextRound: null,
  match: { rule: { kind: 'points', target: 30 }, winner: null },
  fairness: null,
  you: null,
  events: [],
  seq: 0,
  status: 'connecting',
  error: null,
  pending: false,
};

/** The outcome of checking a round at a table hosted in someone's browser. */
export type Fairness =
  | { round: number; status: 'checking' | 'verified' | 'unchecked' }
  | { round: number; status: 'failed'; reason: string };
