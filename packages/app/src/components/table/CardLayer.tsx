import type React from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { CardBack, CardFace } from '../card/PixelCard.js';
import { NONE, SETTLE, transition } from '../../design/motion.js';
import type { CardEntity, Placement } from '../../lib/cardScene.js';
import { transformFor, TRICK_LABEL_ROOM, TRICK_OPEN_Z, type SceneMetrics } from '../../lib/zoneGeometry.js';

/**
 * Every card on the table, in one layer.
 *
 * This is the whole point of the scene model: a card is one DOM node for as
 * long as it is on screen, wherever it happens to be. Moving from a hand to
 * the middle of the table is a change of transform, not a teardown in one
 * component and a rebuild in another — so it *travels*, and it travels for
 * free, with no per-route animation code at all.
 *
 * What this replaces: five separate mechanisms that each faked one journey
 * (instant-departure flags, two measured FLIPs, a direction table for trick
 * entries, and a group sweep), each with its own idea of where things were.
 * All of them existed to paper over cards being destroyed and recreated.
 *
 * The layer is inert to the pointer. Interaction stays with the zones, which
 * know what a click in their area means; the layer only draws.
 */
export interface CardVisual {
  /** Pointer offset while dragging. */
  dx?: number;
  dy?: number;
  /**
   * Overrides the resting scale outright — a card you are touching comes
   * toward you. An absolute size rather than a multiplier, because zones no
   * longer all rest at 1: multiplying the hand's own size by a hover factor
   * compounded two enlargements into one that was neither.
   */
  scale?: number;
  /** Pixels up, for hover and selection. */
  lift?: number;
  /** Lifts the card above everything while it is in your hand. */
  z?: number;
  marked?: boolean;
  /** Only interactive cards take pointer events or carry semantics. */
  interactive?: boolean;
  label?: string;
}

export function CardLayer({
  entities,
  metrics,
  labels,
  visuals,
  handlers,
}: {
  entities: CardEntity[];
  metrics: SceneMetrics;
  /** Per-combo captions, positioned by the same geometry as the cards. */
  labels?: { id: string; text: string; placement: Placement; standing: boolean }[];
  /** Local state laid over the derived placement — hover, drag, selection. */
  visuals?: Map<string, CardVisual>;
  handlers?: {
    onPointerDown(e: React.PointerEvent, id: string): void;
    onPointerMove(e: React.PointerEvent): void;
    onPointerUp(e: React.PointerEvent, id: string): void;
    onPointerEnter(id: string): void;
    onPointerLeave(id: string): void;
    /** Keyboard activation — Enter or Space on a focused card. */
    onActivate(id: string): void;
  };
}) {
  const reduced = useReducedMotion() ?? false;

  // Bounds of the opened trick, so the read-out plate can sit behind it. Taken
  // from the same transforms the cards use, so the plate can never disagree
  // with what it is behind.
  const backdrop = metrics.trickOpen ? trickBounds(entities, metrics) : null;

  return (
    <div className={`cardlayer ${metrics.trickOpen ? 'is-open' : ''}`} aria-hidden="true">
      {/* The plate the opened trick is read against. It grows out of the pile
          it belongs to rather than sliding in: it is born at its final
          position and scales up from its own centre, which is the middle of
          the in-play zone. Animating `x`/`y` from Framer's unset default
          started every appearance at the layer's top-left corner, so the
          plate flew in diagonally across the whole table. */}
      <AnimatePresence>
        {backdrop && (
          <m.div
            className="cardlayer__backdrop"
            // Above every resting card in the layer, below the trick it backs.
            // Left to the default it sat at the bottom of the layer and the
            // seats' own fans painted straight over it.
            style={{ width: backdrop.width, height: backdrop.height, zIndex: TRICK_OPEN_Z }}
            initial={{ opacity: 0, scale: 0.94, x: backdrop.x, y: backdrop.y }}
            animate={{ opacity: 1, scale: 1, x: backdrop.x, y: backdrop.y }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={transition(reduced, SETTLE)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {entities.map((entity) => {
          const to = transformFor(entity.placement, metrics);
          // An entity that did not exist a moment ago starts wherever its
          // `enterFrom` placement resolves to — measured by the same function
          // as its destination, so an entrance can never disagree with a
          // resting position.
          const from = entity.enterFrom ? transformFor(entity.enterFrom, metrics) : null;
          const faceUp = entity.placement.faceUp && entity.card !== null;
          // A combo that has been answered sits behind the one that stands.
          const inTrick = entity.placement.zone === 'trick';
          const standing = inTrick && entity.placement.group === (entity.placement.groups ?? 1) - 1;
          const beaten = inTrick && !standing;

          // Local state rides on top of the derived placement. The placement
          // says where the card belongs; this says what you are doing to it.
          const v = visuals?.get(entity.id);
          const dragging = (v?.dx ?? 0) !== 0 || (v?.dy ?? 0) !== 0;
          const target = {
            x: to.x + (v?.dx ?? 0),
            y: to.y - (v?.lift ?? 0) + (v?.dy ?? 0),
            // A dragged card straightens up: you are holding it, not fanning it.
            rotate: dragging ? 0 : to.rotate,
            scale: v?.scale ?? to.scale,
            opacity: 1,
          };

          return (
            /*
             * Always a `div`, never sometimes a `button`.
             *
             * This used to switch element type with interactivity — a card in
             * your hand was a button, and the moment you played it, it became
             * a div. React sees a different type under the same key and
             * unmounts the old node to mount a new one, which destroys the
             * exact thing this layer exists to preserve: the card teleported
             * to the table instead of travelling there, because the node that
             * was in your hand no longer existed.
             *
             * One element type, and the semantics ride on top of it. The
             * keyboard handling a real button would have given us is already
             * here explicitly (see `onKeyDown`), because pointer-driven
             * selection needed it anyway.
             */
            <m.div
              key={entity.id}
              data-id={entity.id}
              {...(v?.interactive
                ? // Pressed is picked: without it a screen reader could not tell which cards are selected.
                  { role: 'button' as const, tabIndex: 0, 'aria-label': v.label, 'aria-pressed': v.marked ?? false }
                : { 'aria-hidden': true })}
              className={`cardlayer__card ${faceUp ? '' : 'is-down'} ${beaten ? 'is-beaten' : ''} ${
                v?.marked ? 'is-marked' : ''
              } ${v?.interactive ? 'is-live' : ''} ${dragging ? 'is-dragging' : ''} ${
                standing ? 'is-standing' : ''
              }`}
              style={{ zIndex: v?.z ?? to.z }}
              onPointerDown={v?.interactive ? (e: React.PointerEvent) => handlers?.onPointerDown(e, entity.id) : undefined}
              onPointerMove={v?.interactive ? handlers?.onPointerMove : undefined}
              onPointerUp={v?.interactive ? (e: React.PointerEvent) => handlers?.onPointerUp(e, entity.id) : undefined}
              // Selection is driven entirely by pointer events, so a card was
              // reachable by keyboard and did nothing when activated. Handled
              // on keydown rather than through the button's native click so
              // there is one path, not two: `preventDefault` suppresses the
              // click the browser would synthesise, which would otherwise
              // toggle the card straight back again.
              onKeyDown={
                v?.interactive
                  ? (e: React.KeyboardEvent) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      handlers?.onActivate(entity.id);
                    }
                  : undefined
              }
              onPointerEnter={v?.interactive ? () => handlers?.onPointerEnter(entity.id) : undefined}
              onPointerLeave={v?.interactive ? () => handlers?.onPointerLeave(entity.id) : undefined}
              initial={
                from
                  ? { x: from.x, y: from.y, rotate: from.rotate, scale: from.scale, opacity: 1 }
                  : { x: to.x, y: to.y, rotate: to.rotate, scale: to.scale, opacity: 0 }
              }
              animate={target}
              // Cards leave the layer only when they stop existing on screen —
              // reaching the discard pile, or a round ending. Everything else
              // is a move, not an exit.
              exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.14 } }}
              transition={
                dragging
                  ? { x: NONE, y: NONE, rotate: SETTLE, scale: SETTLE }
                  : transition(reduced, SETTLE)
              }
            >
              {faceUp && entity.card ? <CardFace card={entity.card} /> : <CardBack />}
            </m.div>
          );
        })}
      </AnimatePresence>

      <AnimatePresence>
        {labels?.map((label) => {
        const at = transformFor(label.placement, metrics);
        return (
          <m.span
            key={label.id}
            className={`cardlayer__label ${label.standing ? 'is-standing' : ''}`}
            /*
             * Rounded, because `z-index` takes an integer and silently drops
             * the whole declaration otherwise. A caption is positioned at the
             * middle of its combo, and for an even-sized one that middle is a
             * *fractional* slot — which fed a fractional z straight through to
             * here. The browser threw the value away, the label fell back to
             * `auto`, and the read-out plate's explicit z painted over it.
             */
            style={{ zIndex: Math.round(at.z) }}
            initial={{ x: at.x, y: labelY(at, metrics), opacity: 0 }}
            animate={{ x: at.x, y: labelY(at, metrics), opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition(reduced, SETTLE)}
          >
            {/* The caption is positioned by its card's centre, so it has to
                *be* centred on that point. A fixed-width box only centres text
                that fits inside it; an absolutely centred inner span centres
                whatever length the seat name happens to be. */}
            <span className="cardlayer__labeltext">{label.text}</span>
          </m.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/**
 * Where a combo's caption sits: clear of the bottom edge of its own cards, at
 * whatever size those cards are currently drawn. Reading the scale rather than
 * assuming it keeps the caption the same distance below a raised card as below
 * a resting one.
 */
function labelY(at: { y: number; scale: number }, metrics: SceneMetrics): number {
  return at.y + (metrics.cardHeight / 2) * at.scale + 12;
}

/**
 * The box the opened trick occupies, padded — the plate it is read against.
 *
 * Derived from the cards' own transforms rather than measured from the DOM,
 * because the cards are mid-flight when the trick opens and a measurement then
 * describes where they were, not where they are going.
 */
function trickBounds(entities: CardEntity[], metrics: SceneMetrics) {
  const inTrick = entities.filter((e) => e.placement.zone === 'trick');
  if (inTrick.length === 0) return null;

  const pad = metrics.cardWidth * 0.28;
  let left = Infinity;
  let right = -Infinity;
  for (const entity of inTrick) {
    const t = transformFor(entity.placement, metrics);
    const half = (metrics.cardWidth * t.scale) / 2;
    left = Math.min(left, t.x - half);
    right = Math.max(right, t.x + half);
  }
  // Room along the bottom for the captions, which hang below their cards.
  // Without it the plate cut them in half: they are the reason the trick opens
  // at all, so the plate is sized to include them rather than to the cards
  // alone. The opened trick rises by the same amount (see `TRICK_LABEL_ROOM`),
  // so the plate grows upward in effect and its bottom edge stays clear of the
  // combo-type line printed under the zone.
  const first = transformFor(inTrick[0]!.placement, metrics);
  const cards = metrics.cardHeight * first.scale;
  return {
    x: left - pad,
    y: first.y - cards / 2 - pad,
    width: right - left + pad * 2,
    height: cards + pad * 2 + TRICK_LABEL_ROOM,
  };
}
