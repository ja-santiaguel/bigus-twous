import type { PlayerId, PlayerView } from '@big-two/engine';

/**
 * Everything about "where we are right now in this trick", derived from the
 * event log in the redacted view.
 *
 * PlayerView deliberately does not expose the orchestrator's internal
 * TrickState, so strategies reconstruct what they need from `history` — the
 * same log a future networked client receives. Keeping that derivation here,
 * in one place, means no strategy has to re-parse events itself.
 */
export interface TrickContext {
  selfSeat: number;
  /** Seats in turn order starting from the seat after me. */
  turnOrderAfterSelf: { id: PlayerId; seat: number; cardCount: number }[];
  /** Opponents who have NOT yet passed on the current pile — the ones who can still answer me. */
  liveOpponents: { id: PlayerId; seat: number; cardCount: number }[];
  /** Who last actually played cards (owns the pile). Null on a fresh trick. */
  pileOwner: PlayerId | null;
  /** True when the pile is mine — passing means the trick comes back to me. */
  pileIsSelf: boolean;
  /** Fewest cards held by any opponent. 13 when nothing is known yet. */
  minOpponentCards: number;
  /** Opponents at or below the danger threshold — these are the seats to deny the lead to. */
  threats: { id: PlayerId; seat: number; cardCount: number }[];
  /** My own hand size. */
  selfCards: number;
}

/** An opponent this close to going out is treated as an emergency by the harder tiers. */
export const DEFAULT_THREAT_THRESHOLD = 3;

export function readTrickContext(view: PlayerView, threatThreshold = DEFAULT_THREAT_THRESHOLD): TrickContext {
  const seats = new Set(view.opponents.map((o) => o.seat));
  let selfSeat = 0;
  for (let s = 0; s < view.opponents.length + 1; s++) {
    if (!seats.has(s)) {
      selfSeat = s;
      break;
    }
  }

  const seatCount = view.opponents.length + 1;
  const turnOrderAfterSelf = view.opponents
    .slice()
    .sort((a, b) => ((a.seat - selfSeat + seatCount) % seatCount) - ((b.seat - selfSeat + seatCount) % seatCount));

  // Walk the log backwards to the last trick reset, collecting every pass and
  // the most recent play.
  //
  // The walk must not stop at a play. Passing forfeits the whole trick (9.7),
  // so a seat that passed stays out even after somebody else answers the pile
  // — stopping at the last CARDS_PLAYED would forget every pass made before
  // it and have the evaluator expect answers from players who cannot act.
  const passedThisTrick = new Set<PlayerId>();
  let pileOwner: PlayerId | null = null;
  for (let i = view.history.length - 1; i >= 0; i--) {
    const event = view.history[i]!;
    if (event.type === 'TRICK_RESET') break;
    if (event.type === 'CARDS_PLAYED' && pileOwner === null) pileOwner = event.playerId;
    if (event.type === 'PLAYER_PASSED') passedThisTrick.add(event.playerId);
  }
  if (view.pile === null) pileOwner = null;

  // A round now continues until only one player is left holding cards, so the
  // opponent list includes seats that have already gone out. They can neither
  // answer a play nor be denied the lead, and counting them as threats — they
  // hold zero cards, which is below every threshold — would have the CPU
  // panicking over an opponent who has already finished.
  const stillPlaying = turnOrderAfterSelf.filter((o) => o.cardCount > 0);
  const liveOpponents = stillPlaying.filter((o) => !passedThisTrick.has(o.id));
  const minOpponentCards = stillPlaying.reduce((min, o) => Math.min(min, o.cardCount), Number.POSITIVE_INFINITY);

  return {
    selfSeat,
    turnOrderAfterSelf,
    liveOpponents,
    pileOwner,
    pileIsSelf: pileOwner === view.selfId,
    minOpponentCards: Number.isFinite(minOpponentCards) ? minOpponentCards : 13,
    threats: stillPlaying.filter((o) => o.cardCount <= threatThreshold),
    selfCards: view.hand.length,
  };
}
