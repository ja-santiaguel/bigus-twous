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
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <div
      className={`opp opp--${position} ${isTurn ? 'is-turn' : ''} ${hasPassed ? 'is-passed' : ''} ${
        place !== null ? 'is-out' : ''
      }`}
    >
      <span className="opp__name">
        <TurnDot on={isTurn} />
        {name}
        {/* The blinking marker says whose turn it is to the eye only. */}
        {isTurn && <span className="sr-only"> (playing now)</span>}
      </span>

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
        {place !== null ? <PlaceBadge place={place} /> : `${cardCount} ${cardCount === 1 ? 'card' : 'cards'}`} ·{' '}
        {points} {points === 1 ? 'pt' : 'pts'}
      </span>

      {/* A fixed slot, not a row that appears.
          "Passed" used to be added to and removed from the grid, so every seat
          it happened to grew and shrank by a line and shoved its own cards —
          and on the left and right seats, the whole column — up and down the
          screen. The space is reserved whether or not anything is in it. */}
      {/* The clock shares the reserved status line rather than adding one, so a
          seat is the same height whether it is being waited on or not. */}
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
    </div>
  );
}
