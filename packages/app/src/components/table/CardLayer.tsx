import type React from 'react';
import type { Card } from '@big-two/engine';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { CardBack, CardFace } from '../card/PixelCard.js';
import { NONE, SETTLE, transition } from '../../design/motion.js';
import type { CardEntity, Placement } from '../../lib/cardScene.js';
import {
  openTrickLayout,
  transformFor,
  TRICK_LABEL_ROOM,
  TRICK_OPEN_Z,
  type SceneMetrics,
} from '../../lib/zoneGeometry.js';

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
  /** Picked up — hovered, touched or chosen — so it casts a deeper shadow. */
  raised?: boolean;
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
  instant = false,
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
    /** The browser took the pointer away — a scroll, a system gesture. */
    onPointerCancel(e: React.PointerEvent): void;
    /** A mouse only. Carries the event: which card is hovered is decided by where the pointer is. */
    onPointerEnter(e: React.PointerEvent, id: string): void;
    onPointerLeave(e: React.PointerEvent, id: string): void;
    /** Keyboard activation — Enter or Space on a focused card. */
    onActivate(id: string): void;
  };
  /** Follow layout changes without animating — while the window is being resized. */
  instant?: boolean;
}) {
  const reduced = useReducedMotion() ?? false;

  // Which cards were already on screen last render. A shadow that appears for a
  // card that was already here (a hover ending, a trick closing) fades in where
  // the card is; only a card arriving for the first time brings it from where
  // the card came from.
  const known = useRef(new Set<string>());
  useLayoutEffect(() => {
    known.current = new Set(entities.map((entity) => entity.id));
  });

  /*
   * One bundle of handlers, made once. Every card is memoised on its props, and
   * a fresh closure per card per render would defeat that on the very first
   * prop: the identity of its click handler. These read the current handlers
   * through a ref instead, so they never change.
   */
  const latest = useRef(handlers);
  latest.current = handlers;
  const on = useMemo<CardHandlers>(
    () => ({
      down: (e, id) => latest.current?.onPointerDown(e, id),
      move: (e) => latest.current?.onPointerMove(e),
      up: (e, id) => latest.current?.onPointerUp(e, id),
      cancel: (e) => latest.current?.onPointerCancel(e),
      enter: (e) => {
        if (e.pointerType === 'mouse') latest.current?.onPointerEnter(e, '');
      },
      leave: (e) => {
        if (e.pointerType === 'mouse') latest.current?.onPointerLeave(e, '');
      },
      activate: (id) => latest.current?.onActivate(id),
    }),
    [],
  );

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
            transition={instant ? NONE : transition(reduced, SETTLE)}
          />
        )}
      </AnimatePresence>
      {/*
       * The shadows of every card resting on the table or held in a hand.
       *
       * Drawn as one group, beneath all the cards, at one opacity and one blur.
       * Each card casting its own translucent shadow darkened wherever two
       * overlapped — and in a fan of thirteen they all overlap — into hard
       * stripes under the hand. Opaque shapes in a translucent group merge
       * into a single soft shadow instead. A card that is picked up casts its
       * own (see .is-raised), because it is no longer at the height of the rest.
       */}
      <div className="cardlayer__shadows">
        <AnimatePresence>
          {entities.map((entity) => {
            const depth = restingDepth(entity, visuals?.get(entity.id), metrics);
            if (depth === null) return null;
            const to = transformFor(entity.placement, metrics);
            const from =
              entity.enterFrom && !known.current.has(entity.id) ? transformFor(entity.enterFrom, metrics) : null;
            const drop = (metrics.cardWidth / 22) * depth * to.scale;
            const start = from ?? to;
            return (
              <LayerShadow
                key={entity.id}
                x={to.x}
                y={to.y + drop}
                rotate={to.rotate}
                scale={to.scale}
                fromX={start.x}
                fromY={start.y + drop}
                fromRotate={start.rotate}
                fromScale={start.scale}
                instant={instant}
                reduced={reduced}
              />
            );
          })}
        </AnimatePresence>
      </div>

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
          const piled =
            entity.placement.zone === 'discard'
              ? entity.placement.slot === 0
                ? 'is-piled is-pile-base'
                : 'is-piled'
              : '';

          return (
            <LayerCard
              key={entity.id}
              id={entity.id}
              card={entity.card}
              faceUp={faceUp}
              className={`cardlayer__card ${faceUp ? '' : 'is-down'} ${beaten ? 'is-beaten' : ''} ${
                v?.marked ? 'is-marked' : ''
              } ${v?.interactive ? 'is-live' : ''} ${v?.raised ? 'is-raised' : ''} ${
                dragging ? 'is-dragging' : ''
              } ${standing ? 'is-standing' : ''} ${piled}`}
              z={v?.z ?? to.z}
              x={to.x + (v?.dx ?? 0)}
              y={to.y - (v?.lift ?? 0) + (v?.dy ?? 0)}
              // A dragged card straightens up: you are holding it, not fanning it.
              rotate={dragging ? 0 : to.rotate}
              scale={v?.scale ?? to.scale}
              opacity={to.opacity ?? 1}
              fromX={(from ?? to).x}
              fromY={(from ?? to).y}
              fromRotate={(from ?? to).rotate}
              fromScale={(from ?? to).scale}
              fromOpacity={from ? 1 : 0}
              interactive={v?.interactive ?? false}
              label={v?.label}
              marked={v?.marked ?? false}
              dragging={dragging}
              instant={instant}
              reduced={reduced}
              on={on}
            />
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
              transformTemplate={pixelSnap}
              initial={{ x: at.x, y: labelY(at, metrics), opacity: 0 }}
              animate={{ x: at.x, y: labelY(at, metrics), opacity: at.opacity ?? 1 }}
              exit={{ opacity: 0 }}
              transition={instant ? NONE : transition(reduced, SETTLE)}
            >
              {/* The caption is positioned by its card's centre, so it has to
                *be* centred on that point. A fixed-width box only centres text
                that fits inside it; an absolutely centred inner span centres
                whatever length the seat name happens to be. */}
              <LabelText text={label.text} />
            </m.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/**
 * A caption's transform: a flat translate to whole pixels.
 *
 * Captions are pixel text, and pixel text goes soft two ways — a position
 * between pixels (a combo's middle is often a half pixel), or a 3D transform
 * rendered through the table's perspective. This avoids both, even mid-flight.
 */
function pixelSnap({ x, y }: { x?: unknown; y?: unknown }): string {
  const whole = (value: unknown) => Math.round(typeof value === 'number' ? value : parseFloat(String(value ?? 0)) || 0);
  return `translate(${whole(x)}px, ${whole(y)}px)`;
}

/**
 * A caption's text, centred on its anchor by a whole-pixel offset.
 *
 * `translateX(-50%)` centred it too, but half of an odd width is a half pixel,
 * which blurred the name under the combo that stands. Measured again once the
 * typeface has loaded, since the fallback font is a different width.
 */
function LabelText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const centre = () => {
      const el = ref.current;
      if (el) el.style.marginLeft = `${-Math.round(el.offsetWidth / 2)}px`;
    };
    centre();
    void document.fonts?.ready.then(centre);
  }, [text]);
  return (
    <span className="cardlayer__labeltext" ref={ref}>
      {text}
    </span>
  );
}

interface CardHandlers {
  down(e: React.PointerEvent, id: string): void;
  move(e: React.PointerEvent): void;
  up(e: React.PointerEvent, id: string): void;
  cancel(e: React.PointerEvent): void;
  enter(e: React.PointerEvent): void;
  leave(e: React.PointerEvent): void;
  activate(id: string): void;
}

/**
 * One card in the layer, drawn only when something about *it* changes.
 *
 * The layer re-renders on every pointer move — a finger sliding along the hand,
 * a card being dragged — and rebuilding fifty-two cards and their pixel art each
 * time was most of the work a phone did during a gesture. Every prop here is a
 * number, a string or a value that keeps its identity, so React skips the cards
 * the gesture did not touch.
 *
 * Always a `div`, never sometimes a `button`. This used to switch element type
 * with interactivity — a card in your hand was a button, and the moment you
 * played it, it became a div. React sees a different type under the same key and
 * unmounts the old node to mount a new one, which destroys the exact thing this
 * layer exists to preserve: the card teleported to the table instead of
 * travelling there. The keyboard handling a real button would have given us is
 * here explicitly (see `onKeyDown`), because pointer-driven selection needed it
 * anyway.
 */
const LayerCard = memo(function LayerCard({
  id,
  card,
  faceUp,
  className,
  z,
  x,
  y,
  rotate,
  scale,
  opacity,
  fromX,
  fromY,
  fromRotate,
  fromScale,
  fromOpacity,
  interactive,
  label,
  marked,
  dragging,
  instant,
  reduced,
  on,
}: {
  id: string;
  card: Card | null;
  faceUp: boolean;
  className: string;
  z: number;
  x: number;
  y: number;
  rotate: number;
  scale: number;
  opacity: number;
  fromX: number;
  fromY: number;
  fromRotate: number;
  fromScale: number;
  fromOpacity: number;
  interactive: boolean;
  label?: string | undefined;
  marked: boolean;
  dragging: boolean;
  instant: boolean;
  reduced: boolean;
  on: CardHandlers;
}) {
  return (
    <m.div
      // Only a face-up card names itself in the page. A face-down one — an
      // opponent's, or one in the discard pile — carries no identity at all.
      data-id={faceUp ? id : undefined}
      {...(interactive
        ? // Pressed is picked: without it a screen reader could not tell which cards are selected.
          { role: 'button' as const, tabIndex: 0, 'aria-label': label, 'aria-pressed': marked }
        : { 'aria-hidden': true })}
      className={className}
      style={{ zIndex: z }}
      onPointerDown={interactive ? (e: React.PointerEvent) => on.down(e, id) : undefined}
      onPointerMove={interactive ? on.move : undefined}
      onPointerUp={interactive ? (e: React.PointerEvent) => on.up(e, id) : undefined}
      // Selection is driven entirely by pointer events, so a card was reachable
      // by keyboard and did nothing when activated. Handled on keydown rather
      // than through the button's native click so there is one path, not two:
      // `preventDefault` suppresses the click the browser would synthesise,
      // which would otherwise toggle the card straight back again.
      onKeyDown={
        interactive
          ? (e: React.KeyboardEvent) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              on.activate(id);
            }
          : undefined
      }
      onPointerCancel={interactive ? on.cancel : undefined}
      // Hover is a mouse's. A finger "enters" a card by pressing it, and
      // treating that as hover left a lifted card behind after the tap.
      onPointerEnter={interactive ? on.enter : undefined}
      onPointerLeave={interactive ? on.leave : undefined}
      initial={{ x: fromX, y: fromY, rotate: fromRotate, scale: fromScale, opacity: fromOpacity }}
      animate={{ x, y, rotate, scale, opacity }}
      // Cards leave the layer only when they stop existing on screen — reaching
      // the discard pile, or a round ending. Everything else is a move.
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.14 } }}
      transition={
        instant ? NONE : dragging ? { x: NONE, y: NONE, rotate: SETTLE, scale: SETTLE } : transition(reduced, SETTLE)
      }
    >
      {faceUp && card ? <CardFace card={card} /> : <CardBack />}
    </m.div>
  );
});

/**
 * One card's shadow in the shared group, redrawn only when that card moves.
 *
 * The same reason as `LayerCard`: every play and pass re-renders the layer, and
 * fifty-odd animated shadows rebuilt each time was a good share of the frame a
 * phone spent on it — the difference between a round playing out fast and one
 * that stutters as it does.
 */
const LayerShadow = memo(function LayerShadow({
  x,
  y,
  rotate,
  scale,
  fromX,
  fromY,
  fromRotate,
  fromScale,
  instant,
  reduced,
}: {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  fromX: number;
  fromY: number;
  fromRotate: number;
  fromScale: number;
  instant: boolean;
  reduced: boolean;
}) {
  return (
    <m.div
      className="cardlayer__shadow"
      initial={{ x: fromX, y: fromY, rotate: fromRotate, scale: fromScale, opacity: 0 }}
      animate={{ x, y, rotate, scale, opacity: 1 }}
      // Fades at the pace the picked-up card's own shadow eases in
      // (.cardlayer__card .pcard), so lifting a card hands its shadow over in
      // one smooth change instead of a blink.
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : SHADOW_FADE_S, ease: 'easeOut' } }}
      transition={
        instant
          ? NONE
          : { ...transition(reduced, SETTLE), opacity: { duration: reduced ? 0 : SHADOW_FADE_S, ease: 'easeOut' } }
      }
    />
  );
});

/** Seconds a shadow takes to hand over between the shared group and a card's own. Matches the CSS. */
const SHADOW_FADE_S = 0.18;

/**
 * How far below a resting card its shadow falls, in art pixels — or null when
 * it casts none in the shared shadow group.
 *
 * Played cards lie on the felt, two pixels up. Hands are held, three up. Only
 * the bottom card of the discard pile casts, a pixel, as the pile's floor. A
 * card that is picked up, dragged, or part of a trick opened for reading casts
 * its own shadow instead.
 */
function restingDepth(entity: CardEntity, visual: CardVisual | undefined, metrics: SceneMetrics): number | null {
  if (visual?.raised || (visual?.dx ?? 0) !== 0 || (visual?.dy ?? 0) !== 0) return null;
  switch (entity.placement.zone) {
    case 'hand':
      return 3;
    case 'trick':
      return metrics.trickOpen ? null : 2;
    case 'discard':
      return entity.placement.slot === 0 ? 1 : null;
  }
}

/**
 * Where a combo's caption sits: clear of the bottom edge of its own cards, at
 * whatever size those cards are currently drawn. Reading the scale rather than
 * assuming it keeps the caption the same distance below a raised card as below
 * a resting one.
 */
function labelY(at: { y: number; scale: number }, metrics: SceneMetrics): number {
  // One --u (four art pixels) below the card — the same gap the discard pile's
  // count hangs by, so the two captions beside each other sit on one line.
  return at.y + (metrics.cardHeight / 2) * at.scale + (metrics.cardWidth / 22) * 4;
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
  //
  // A trick longer than its window scrolls, so the plate is the window, not
  // the whole line: cards beyond it are fading out, not sitting on the plate.
  const frame = openTrickLayout(
    inTrick[0]!.placement.trickCount ?? inTrick.length,
    inTrick[0]!.placement.groups ?? 1,
    metrics,
  );
  if (frame.maxScroll > 0) {
    left = Math.max(left, frame.left);
    right = Math.min(right, frame.right);
  }
  const first = transformFor(inTrick[0]!.placement, metrics);
  const cards = metrics.cardHeight * first.scale;
  return {
    x: left - pad,
    y: first.y - cards / 2 - pad,
    width: right - left + pad * 2,
    height: cards + pad * 2 + TRICK_LABEL_ROOM,
  };
}
