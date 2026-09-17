import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { SNAP, transition } from '../../design/motion.js';
import type { SeatPosition } from '../../lib/format.js';
import { TurnDot } from './TurnDot.js';
import { TurnClock } from './TurnClock.js';
import { PlaceBadge } from './PlaceBadge.js';

/**
 * An opponent: their name, how many cards they hold, and the box their fan
 * occupies.
 *
 * The fan itself belongs to the card layer. This seat only says where it is —
 * which is what lets a card travel from here to the table as one object
 * instead of being destroyed in this component and recreated in another.
 */
export function OpponentSeat({
  name,
  position,
  cardCount,
  points,
  place,
  isTurn,
  hasPassed,
  clock,
  fanRef,
  cpu = false,
}: {
  name: string;
  position: SeatPosition;
  cardCount: number;
  /** Running match points (9.15). */
  points: number;
  /** Where they finished this round, 0-based, or null while still holding cards. */
  place: number | null;
  isTurn: boolean;
  hasPassed: boolean;
  /** Non-null only while this seat is the one being waited on. */
  clock: { remainingMs: number; totalMs: number } | null;
  /** Anchor the card layer positions this seat's cards into. */
  fanRef: (el: HTMLElement | null) => void;
  /** A computer holds this seat, said beside the name as the lobby says it. */
  cpu?: boolean;
}) {
  const reduced = useReducedMotion() ?? false;

  const nameLine = (
    <span className="opp__name">
      <TurnDot on={isTurn} />
      <span>{name}</span>
      {/* Always present, empty for a person: on a phone it is a line of its
          own under the name, and every seat keeps that line so the fans stay
          level whoever holds them. */}
      <span className="opp__role">{cpu ? '(CPU)' : ''}</span>
      {/* The blinking marker says whose turn it is to the eye only. */}
      {isTurn && <span className="sr-only"> (playing now)</span>}
    </span>
  );

  /* A fixed slot, not a row that appears: "passed" and the clock share it, so a
     seat is the same height whether anything is in it or not. */
  const statusLine = (
    <span className="opp__status">
      {clock && <TurnClock remainingMs={clock.remainingMs} totalMs={clock.totalMs} variant="seat" />}
      <AnimatePresence>
        {hasPassed && (
          <m.span
            className="opp__passed"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={transition(reduced, SNAP)}
          >
            passed
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );

  const className = `opp opp--${position} ${isTurn ? 'is-turn' : ''} ${
    hasPassed ? 'is-passed' : ''
  } ${place !== null ? 'is-out' : ''}`;

  return (
    <div className={className}>
      {nameLine}

      {/* An anchor, not a fan. The cards are drawn by the card layer, which
          positions them from this box — so the card that leaves this seat when
          its owner plays is the same object that lands on the table, rather
          than one vanishing here and another appearing there. */}
      <div className="minifan" ref={fanRef} />

      <span className="opp__meta">
        {/* A seat that has emptied its hand still sits at the table until the
            round ends. "Out" was the wrong word for it — it reads as
            eliminated, when it is the opposite: they finished, and finishing
            first is how you win. So say where they came. */}
        <span>
          {place !== null ? <PlaceBadge place={place} /> : `${cardCount} ${cardCount === 1 ? 'card' : 'cards'}`}
        </span>
        {/* On a phone the two halves stack instead, and the dot goes. */}
        <span className="opp__sep">·</span>
        <span>
          {points} {points === 1 ? 'pt' : 'pts'}
        </span>
      </span>

      {statusLine}
    </div>
  );
}
