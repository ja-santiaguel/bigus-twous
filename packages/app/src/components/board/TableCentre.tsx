import type React from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import type { PlayerId } from '@big-two/engine';
import { cardsSpoken, comboLabel } from '../../lib/format.js';
import { SNAP, transition } from '../../design/motion.js';
import type { TrickPlay } from '../../lib/tableView.js';

/** How far a finger or mouse moves before pressing the trick becomes scrolling it. */
const SCROLL_SLOP_PX = 6;

/**
 * The middle of the table — an *anchor* rather than a card owner.
 *
 * The cards in play are drawn by the card layer, which positions them from the
 * box this component reports. A zone says where it is and what it means, and
 * the layer draws the cards, so a card arriving here from somebody's hand is
 * the same object that was in their hand a moment ago.
 *
 * What stays here is everything that is *not* a card: the drop target, the
 * caption naming the combo, the place the discard pile lands with its count —
 * and how you read the trick. Pointing at it opens it (a tap, on a phone), and
 * a long trick scrolls inside its window by wheel, by dragging or swiping, or
 * with the arrow keys once it has focus.
 */
/*
 * Memoised, as the seats are: a finger sliding along your hand re-renders the
 * table on every card it crosses, and nothing here depends on what is picked.
 */
export const TableCentre = memo(function TableCentre({
  trickPlays,
  moundCount,
  labelFor,
  dropRef,
  trickRef,
  discardRef,
  open,
  onOpenChange,
  onScroll,
  scrollStep = 64,
  dropActive,
  dropValid,
}: {
  trickPlays: TrickPlay[];
  moundCount: number;
  labelFor: (playerId: PlayerId) => string;
  /** The drop area for playing by dragging: the whole middle band, not the trick's box. */
  dropRef?: (el: HTMLElement | null) => void;
  /** Anchor the card layer positions the trick into. */
  trickRef: (el: HTMLElement | null) => void;
  /** Anchor for the discard pile. */
  discardRef: (el: HTMLElement | null) => void;
  /** Whether the trick is expanded for reading — owned by the table, used by the layer. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Scroll the opened trick: positive moves back toward older plays, negative
   * forward toward the newest. Absent when the trick fits its window.
   */
  onScroll?: ((by: number) => void) | undefined;
  /** One card's step, for the arrow keys. */
  scrollStep?: number;
  /** A dragged card is over the table right now. */
  dropActive?: boolean;
  /** ...and the play it would make is legal. */
  dropValid?: boolean;
}) {
  const reduced = useReducedMotion() ?? false;
  const standing = trickPlays[trickPlays.length - 1];
  const hasPlays = trickPlays.length > 0;
  const node = useRef<HTMLDivElement | null>(null);
  /** A press on the trick, until it is known to be a tap or a scroll. */
  const press = useRef<{ pointerId: number; x: number; moved: boolean; type: string } | null>(null);

  /**
   * The in-play box is the anchor the card layer positions the trick into, and
   * this component also needs the node for its own listeners. The combined
   * callback has to keep a stable identity — a fresh closure each render makes
   * React detach and reattach the ref every time, and since attaching
   * re-measures, that is an infinite render loop.
   */
  const setTrickNode = useCallback(
    (el: HTMLDivElement | null) => {
      node.current = el;
      trickRef(el);
    },
    [trickRef],
  );

  // The wheel, attached natively: React's wheel listener is passive, and a
  // wheel that scrolls the trick must not also scroll the page behind it.
  useEffect(() => {
    const el = node.current;
    if (!el || !open || !onScroll) return undefined;
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      onScroll(-delta);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, onScroll]);

  // Opened by a tap, it closes on a tap anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!node.current?.contains(event.target as Node)) onOpenChange(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open, onOpenChange]);

  return (
    <div className={`centre ${dropActive ? (dropValid ? 'is-drop-target' : 'is-drop-blocked') : ''}`} ref={dropRef}>
      <div
        ref={setTrickNode}
        className={`inplay ${open ? 'is-open' : ''} ${open && onScroll ? 'is-scrollable' : ''}`}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse' && hasPlays) onOpenChange(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse' && !press.current) onOpenChange(false);
        }}
        onPointerDown={(event) => {
          if (!hasPlays) return;
          // The trick's own gesture: not the start of a sweep across the table.
          event.stopPropagation();
          press.current = { pointerId: event.pointerId, x: event.clientX, moved: false, type: event.pointerType };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* capture is an optimisation, not a requirement */
          }
        }}
        onPointerMove={(event) => {
          const current = press.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const dx = event.clientX - current.x;
          if (!current.moved && Math.abs(dx) < SCROLL_SLOP_PX) return;
          current.moved = true;
          current.x = event.clientX;
          if (!open) onOpenChange(true);
          // Dragging the line right reveals what is to its left: older plays.
          onScroll?.(dx);
        }}
        onPointerUp={(event) => {
          const current = press.current;
          press.current = null;
          try {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          } catch {
            /* already released */
          }
          // A finger has no hover: a tap opens the trick, and another closes it.
          if (current && !current.moved && current.type !== 'mouse') onOpenChange(!open);
        }}
        onPointerCancel={() => {
          press.current = null;
        }}
        onFocus={() => onOpenChange(true)}
        onBlur={() => onOpenChange(false)}
        onKeyDown={(event) => {
          if (!open || !onScroll) return;
          const by =
            event.key === 'ArrowLeft'
              ? scrollStep
              : event.key === 'ArrowRight'
                ? -scrollStep
                : event.key === 'Home'
                  ? Number.MAX_SAFE_INTEGER
                  : event.key === 'End'
                    ? -Number.MAX_SAFE_INTEGER
                    : 0;
          if (!by) return;
          event.preventDefault();
          onScroll(by);
        }}
        tabIndex={hasPlays ? 0 : -1}
        role="group"
        aria-label={trickAria(trickPlays, labelFor)}
      >
        {!hasPlays && <span className="inplay__empty">Table is clear — the lead plays anything.</span>}
      </div>

      {/* The combo type is stated once here rather than repeated under every
          group in the trick. Every combo in a trick is the same type by
          definition — you may only answer a pair chain with a pair chain — so
          printing it per group said one thing several times over. */}
      <div className="centre__read" aria-live="polite">
        {standing ? (
          <>
            <span className="centre__type">{comboLabel(standing.combo)}</span>
            {/* Who played is already on the table, in the name under their
                cards, so it is not printed again here. The cards are drawn,
                not written, so a screen reader is told both. */}
            <span className="sr-only">
              {' '}
              {labelFor(standing.playerId)} played {cardsSpoken(standing.combo.cards)}
            </span>
          </>
        ) : (
          // Nothing to say, but the line keeps its height, so the trick
          // arriving does not nudge the discard pile below it.
          <span className="centre__type" aria-hidden="true">
            {' '}
          </span>
        )}
      </div>

      <MoundStack count={moundCount} reduced={reduced} stackRef={discardRef} />
    </div>
  );
});

function trickAria(plays: TrickPlay[], labelFor: (id: PlayerId) => string): string {
  if (plays.length === 0) return 'Table is clear';
  return plays
    .map(
      (p) =>
        `${labelFor(p.playerId)} played ${cardsSpoken(p.combo.cards)}${p.isActive ? ', currently standing' : ', beaten'}`,
    )
    .join('. ');
}

/**
 * Where the discard pile lands, and how many cards are in it.
 *
 * The pile itself is drawn by the card layer from the cards that went into it,
 * face down, so there is one pile and it is made of those cards.
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
  return (
    <div className={`mound ${count === 0 ? 'is-empty' : ''}`} aria-label={`${count} cards played, face down`}>
      <div className="mound__stack" ref={stackRef} />
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
