import { m, useReducedMotion } from 'framer-motion';
import type { PileClaim, PlayerId } from '@big-two/engine';
import { CardBack } from '../card/PixelCard.js';
import { personName } from '../../lib/format.js';
import { useSeatNames } from '../../lib/useSeatNames.js';
import { DEAL_STAGGER_S, SETTLE, transition } from '../../design/motion.js';
import { TurnClock } from './TurnClock.js';

/**
 * The deal, and the pile pick (9.13).
 *
 * Unlike every other animation in the app, this one is not replaying something
 * the engine already decided — the pick is a real choice, and the round does
 * not exist until all four are made. You claim first, then the computers take
 * what is left.
 *
 * The picks are **blind**: four identical stacks of thirteen face-down cards,
 * and nothing to tell them apart. That is the whole point of the ceremony, and
 * it is what makes "you always pick first" a courtesy rather than an
 * advantage. It is ritual, and it is meant to feel like one.
 */
/** Cards per pile — four piles of thirteen make the deck (9.13). */
const PILE_SIZE = 13;

export function PileCeremony({
  claims,
  remaining,
  picker,
  interactive,
  seatIds,
  humanSeat,
  clock = null,
  onChoose,
}: {
  /** Claims settled so far, in pick order. */
  claims: PileClaim[];
  /** Pile indexes still unclaimed. */
  remaining: number[];
  /** Seat currently choosing, or null between picks. */
  picker: PlayerId | null;
  /** True when the ceremony is waiting on this player's click. */
  interactive: boolean;
  seatIds: PlayerId[];
  humanSeat: number;
  /** The picker's clock at a shared table; null when nobody is being timed. */
  clock?: { remainingMs: number; totalMs: number } | null;
  onChoose: (pileIndex: number) => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const seatNames = useSeatNames();
  const who = (id: PlayerId) => personName(seatIds.indexOf(id), humanSeat, seatNames);

  const takenBy = new Map<number, PlayerId>();
  for (const claim of claims) takenBy.set(claim.pileIndex, claim.playerId);

  const lastClaim = claims[claims.length - 1];
  const line = interactive
    ? 'Choose a pile.'
    : picker
      ? `${who(picker)} is choosing…`
      : remaining.length === 0
        ? 'Piles claimed — here is your hand.'
        : lastClaim
          ? // The beat between picks. Naming who just took one beats repeating
            // "Dealing…", which is both wrong by then and says nothing.
            `${who(lastClaim.playerId)} took a pile.`
          : 'Dealing…';

  return (
    <div className="ceremony" role="group" aria-label="Pile selection">
      <p className="ceremony__line" role="status" aria-live="polite">
        {line}
      </p>

      {/* A slot of fixed height: the clock comes and goes between pickers, and
          the piles under it must not jump when it does. */}
      <div className="ceremony__clock">
        {clock && <TurnClock remainingMs={clock.remainingMs} totalMs={clock.totalMs} purpose="pick" />}
      </div>

      <div className={`ceremony__piles ${interactive ? 'is-choosing' : ''}`}>
        {[0, 1, 2, 3].map((pileIndex) => {
          const owner = takenBy.get(pileIndex);
          const pickable = interactive && !owner;
          return (
            <m.div
              key={pileIndex}
              className={`cpile ${owner ? 'is-taken' : ''} ${pickable ? 'is-pickable' : ''}`}
              initial={reduced ? false : { opacity: 0, y: -40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={transition(reduced, { ...SETTLE, delay: pileIndex * 0.08 })}
            >
              {/* A pile is only a button while it can actually be taken. A dead
                  control that still looks like a control is worse than no
                  control — people click it and conclude the game is broken. */}
              <button
                type="button"
                className="cpile__hit"
                disabled={!pickable}
                onClick={() => onChoose(pileIndex)}
                aria-label={owner ? `Pile ${pileIndex + 1}, taken by ${who(owner)}` : `Take pile ${pileIndex + 1}`}
              >
                <span className="cpile__stack">
                  {/* Thirteen backs, fanned just enough to read as a pile of cards
                      rather than a single thick card. */}
                  {Array.from({ length: PILE_SIZE }, (_, i) => (
                    <m.span
                      key={i}
                      className="cpile__card"
                      style={{ zIndex: i }}
                      initial={reduced ? false : { opacity: 0, x: 0, y: -120 }}
                      // Thirteen cards squared up into a block: each layer a
                      // whole art pixel higher and a fraction across, so the
                      // pile has a visible thickness and a leaning edge. The
                      // old version fanned them two pixels apart each, which
                      // read as a spread hand rather than a stack waiting to
                      // be picked up.
                      animate={{ opacity: 1, x: i * 0.5, y: i * -0.5 }}
                      transition={transition(reduced, {
                        ...SETTLE,
                        delay: (i * 4 + pileIndex) * DEAL_STAGGER_S * 0.25,
                      })}
                    >
                      <CardBack />
                    </m.span>
                  ))}
                </span>
              </button>
              <span className="cpile__label">{owner ? who(owner) : `Pile ${pileIndex + 1}`}</span>
            </m.div>
          );
        })}
      </div>
    </div>
  );
}
