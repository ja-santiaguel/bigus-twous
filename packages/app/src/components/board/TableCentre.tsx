import type React from 'react';
import { useCallback } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import type { PlayerId } from '@big-two/engine';
import { CardBack } from '../card/PixelCard.js';
import { cardsSpoken, comboLabel } from '../../lib/format.js';
import { SETTLE, SNAP, transition } from '../../design/motion.js';
import type { TrickPlay } from '../../lib/tableView.js';

/**
 * The middle of the table — now an *anchor* rather than a card owner.
 *
 * The cards in play are drawn by the card layer, which positions them from the
 * box this component reports. That is the whole reorganisation: a zone says
 * where it is and what it means, and the layer draws the cards, so a card
 * arriving here from somebody's hand is the same object that was in their hand
 * a moment ago rather than a new one faded in to look like it.
 *
 * What stays here is everything that is *not* a card: the drop target, the
 * caption naming the combo, and the discard pile, which is deliberately
 * anonymous — remembering what has gone is a player skill, and card counting
 * is the one thing the hard CPU does that the other tiers do not.
 */
export function TableCentre({
  trickPlays,
  moundCount,
  labelFor,
  dropRef,
  trickRef,
  discardRef,
  open,
  onOpenChange,
  dropActive,
  dropValid,
}: {
  trickPlays: TrickPlay[];
  moundCount: number;
  labelFor: (playerId: PlayerId) => string;
  /** Published outward so a dragged card can be dropped here to play it. */
  dropRef?: React.RefObject<HTMLDivElement>;
  /** Anchor the card layer positions the trick into. */
  trickRef: (el: HTMLElement | null) => void;
  /** Anchor for the discard pile. */
  discardRef: (el: HTMLElement | null) => void;
  /** Whether the trick is expanded for reading — owned by the table, used by the layer. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A dragged card is over the table right now. */
  dropActive?: boolean;
  /** ...and the play it would make is legal. */
  dropValid?: boolean;
}) {
  const reduced = useReducedMotion() ?? false;
  const standing = trickPlays[trickPlays.length - 1];

  /**
   * The in-play box is two things at once: the drop target for a dragged card,
   * and the anchor the card layer positions the trick into. Both need the same
   * node, and the combined callback has to keep a stable identity — a fresh
   * closure each render makes React detach and reattach the ref every time,
   * and since attaching re-measures, that is an infinite render loop.
   */
  const setTrickNode = useCallback(
    (node: HTMLDivElement | null) => {
      if (dropRef) (dropRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      trickRef(node);
    },
    [dropRef, trickRef],
  );

  return (
    <div className="centre">
      <div
        ref={setTrickNode}
        className={`inplay ${open ? 'is-open' : ''} ${
          dropActive ? (dropValid ? 'is-drop-target' : 'is-drop-blocked') : ''
        }`}
        onPointerEnter={() => onOpenChange(true)}
        onPointerLeave={() => onOpenChange(false)}
        onFocus={() => onOpenChange(true)}
        onBlur={() => onOpenChange(false)}
        tabIndex={trickPlays.length > 0 ? 0 : -1}
        role="group"
        aria-label={trickAria(trickPlays, labelFor)}
      >
        {trickPlays.length === 0 && (
          <span className="inplay__empty">Table is clear — the lead plays anything.</span>
        )}
      </div>

      {/* The combo type is stated once here rather than repeated under every
          group in the trick. Every combo in a trick is the same type by
          definition — you may only answer a pair chain with a pair chain — so
          printing it per group said one thing several times over. */}
      <div className="centre__read" aria-live="polite">
        {standing ? (
          <>
            <span className="centre__type">{comboLabel(standing.combo)}</span>
            <span className="centre__by">{labelFor(standing.playerId)} leads the trick</span>
            {/* The cards are drawn, not written, so without this the
                announcement said who played and never what. */}
            <span className="sr-only">: {cardsSpoken(standing.combo.cards)}</span>
          </>
        ) : (
          // Nothing to say, but the line keeps its height, so the trick
          // arriving does not nudge the discard pile below it.
          <span className="centre__type" aria-hidden="true">
            {' '}
          </span>
        )}
      </div>

      <MoundStack count={moundCount} reduced={reduced} stackRef={discardRef} />
    </div>
  );
}

function trickAria(plays: TrickPlay[], labelFor: (id: PlayerId) => string): string {
  if (plays.length === 0) return 'Table is clear';
  return plays
    .map(
      (p) =>
        `${labelFor(p.playerId)} played ${cardsSpoken(p.combo.cards)}${p.isActive ? ', currently standing' : ', beaten'}`,
    )
    .join('. ');
}

/** A stack reads as "a lot" long before it reads as "31", so cap the layers drawn. */
const MAX_LAYERS = 13;

/**
 * How far each card in the discard pile sits above the one below it, and how
 * far it drifts sideways — the same tight stagger the ceremony piles use. A
 * deck is a block with a textured edge, not a staircase.
 */
const LAYER_RISE = 0.5;
const LAYER_DRIFT = 0.5;

/**
 * Deterministic wobble — a stack of cards is never perfectly square, but it
 * should look the same every render rather than twitching on each paint.
 */
function jitter(i: number): number {
  return ((i * 37) % 7) - 3;
}

/**
 * The discard pile: cards from tricks that are already settled.
 *
 * Anonymous by design, and the one place a card stops being an individual.
 * Cards fly here as themselves and are handed over to this stack on arrival,
 * which is what keeps the guarantee that a played card carries no rank data in
 * the DOM at all.
 */
function MoundStack({
  count,
  reduced,
  stackRef,
}: {
  count: number;
  reduced: boolean;
  stackRef: (el: HTMLElement | null) => void;
}) {
  const layers = Math.min(MAX_LAYERS, count);

  return (
    <div className={`mound ${count === 0 ? 'is-empty' : ''}`} aria-label={`${count} cards played, face down`}>
      <div className="mound__stack" ref={stackRef}>
        {Array.from({ length: layers }, (_, i) => (
          <m.span
            key={i}
            className="mound__layer"
            style={{ zIndex: i }}
            // Each new batch lands with a short shuffle, so the pile is seen
            // receiving the trick rather than quietly incrementing a number.
            animate={
              reduced
                ? { x: i * LAYER_DRIFT, y: i * -LAYER_RISE }
                : {
                    x: [i * LAYER_DRIFT + jitter(i), i * LAYER_DRIFT],
                    y: [i * -LAYER_RISE - 5, i * -LAYER_RISE],
                    rotate: [jitter(i), 0],
                  }
            }
            transition={transition(reduced, { ...SETTLE, delay: reduced ? 0 : i * 0.02 })}
          >
            <CardBack />
          </m.span>
        ))}
      </div>
      <m.span
        className="mound__count"
        key={count}
        initial={reduced ? false : { opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={transition(reduced, SNAP)}
      >
        {count} played
      </m.span>
    </div>
  );
}
