import { fanSlots, OPPONENT_FAN, PLAYER_FAN } from '../components/card/fanGeometry.js';
import { CARD_SCALE } from '../design/cardScale.js';
import type { Placement } from './cardScene.js';

/**
 * Where a placement lands on screen.
 *
 * Pure: given the measured boxes of the zones, a placement resolves to one
 * transform. Nothing here reads the DOM or the store, so the whole layout is
 * testable without a browser, and a resize is just different input rather than
 * a re-entrant measuring pass.
 *
 * Everything is expressed as the **centre** of a card, relative to the card
 * layer's own box. One coordinate space for the entire table is the point: it
 * is what lets a card move from a hand to the middle of the board without
 * anybody converting between two components' idea of the origin.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneMetrics {
  /** The card layer's box. All output is relative to its top-left. */
  layer: Rect;
  /** Where each seat's fan sits, by seat index. */
  hands: Map<number, Rect>;
  trick: Rect | null;
  discard: Rect | null;
  /** Full-size card dimensions in device pixels. */
  cardWidth: number;
  cardHeight: number;
  /** Seat the viewer occupies — the only hand dealt face up. */
  viewerSeat: number;
  /** True while the trick is expanded for reading. */
  trickOpen: boolean;
}

export interface CardTransform {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  z: number;
}

/**
 * What size a card rests at in each zone — every value drawn from the one
 * ladder in `design/cardScale`, so there is no such thing as a size that
 * belongs to only one zone.
 */
export const ZONE_SCALE = {
  hand: CARD_SCALE.large,
  opponentHand: CARD_SCALE.small,
  trick: CARD_SCALE.base,
  // The discard pile sits on the table beside the trick and is made of the
  // same cards, so it is the same size. Flying a card in at a smaller scale
  // than the pile it lands on drew two piles of different sizes on top of
  // each other.
  discard: CARD_SCALE.base,
} as const;

/**
 * Vertical room the opened trick reserves for its captions.
 *
 * The captions hang below their combos and are the reason the trick opens at
 * all, so the read-out plate has to contain them. Rather than growing the
 * plate downward — which drops it onto the combo-type line underneath — the
 * opened trick rises by this much and the plate grows into the space that
 * frees up, keeping its bottom edge exactly where the closed trick's was.
 */
export const TRICK_LABEL_ROOM = 26;

/** Stacking, by zone. A dragged card is lifted above everything by the caller. */
const ZONE_Z = {
  discard: 10,
  hand: 20,
  trick: 40,
} as const;

/**
 * Where the trick sits while it is opened out for reading.
 *
 * Far above every other zone, because the opened trick is a read-out laid over
 * the table and has to cover it. At the ordinary trick height the seats' own
 * fans — which are cards in this same layer — painted straight over the plate.
 */
export const TRICK_OPEN_Z = 130;

/** A card under the pointer rises above every resting zone and the opened trick. */
export const HOVER_Z = 800;
/** A card being dragged rises above everything, including a hovered neighbour. */
export const DRAG_Z = 900;

const centreOf = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/**
 * Widest spacing that still fits the fan in the space available, capped so a
 * short hand does not spread into a straight line. Shared by every seat so
 * that a hand of five looks like a hand of five wherever it is sitting.
 */
export function fanGap(count: number, available: number, cardWidth: number): number {
  if (count <= 1 || available <= 0) return cardWidth * 0.72;
  // A rotated card is wider than its own width: the end cards sit at roughly
  // half the spread and each overhangs by height x sin(angle). Ignoring that is
  // what pushes the outermost cards off the edge of a narrow screen.
  const cardHeight = cardWidth * 1.4;
  const overhang = cardHeight * Math.sin((20 * Math.PI) / 180) * 2;
  const usable = available - cardWidth - overhang;
  return Math.max(11, Math.min(cardWidth * 0.72, usable / (count - 1)));
}

export function transformFor(placement: Placement, metrics: SceneMetrics): CardTransform {
  switch (placement.zone) {
    case 'hand':
      return handTransform(placement, metrics);
    case 'trick':
      return trickTransform(placement, metrics);
    case 'discard':
      return discardTransform(placement, metrics);
  }
}

function handTransform(placement: Placement, metrics: SceneMetrics): CardTransform {
  const seat = placement.seat ?? metrics.viewerSeat;
  const own = seat === metrics.viewerSeat;
  const rect = metrics.hands.get(seat);
  const scale = own ? ZONE_SCALE.hand : ZONE_SCALE.opponentHand;

  if (!rect) return { x: 0, y: 0, rotate: 0, scale, z: ZONE_Z.hand };

  const cardWidth = metrics.cardWidth * scale;
  const cardHeight = metrics.cardHeight * scale;
  const slots = own
    ? fanSlots(placement.count, {
        ...PLAYER_FAN,
        gap: fanGap(placement.count, rect.width, cardWidth),
      })
    : // Fitted to the seat's box, exactly as your own fan is fitted to yours.
      // A fixed gap looked right at one hand size and spilled off both edges of
      // the table at thirteen cards.
      fanSlots(placement.count, { ...OPPONENT_FAN, gap: fanGap(placement.count, rect.width, cardWidth) });
  const slot = slots[placement.slot] ?? { x: 0, y: 0, angle: 0 };
  const dip = slots.reduce((max, s) => Math.max(max, s.y), 0);

  /**
   * The fan is centred in its box on what it *actually* covers.
   *
   * A rotated card is taller than the card is: turn it by an angle and its
   * upright footprint becomes `h·cos + w·sin`. That overhang grows with the
   * spread, and the spread grows with the number of cards until it caps — so
   * measuring the fan as "one card plus the arc's bulge" made its real height
   * depend on how many cards a seat happened to be holding. Three seats laid
   * out by that rule sat at three different heights in identical boxes, some
   * spilling over the count printed underneath.
   *
   * Measuring every slot's true extent and centring that costs a loop over at
   * most thirteen trivial terms, and makes a seat's fan sit in the same place
   * whether it holds two cards or thirteen.
   */
  const extent = fanExtent(slots, dip, cardWidth, cardHeight);
  const centre = rect.y + rect.height / 2 - metrics.layer.y;

  return {
    // The arc bulges toward the player holding it: the middle of the fan sits
    // highest, the ends drop away.
    x: rect.x + rect.width / 2 - metrics.layer.x + slot.x,
    y: centre - (extent.top + extent.bottom) / 2 - (dip - slot.y),
    rotate: slot.angle,
    scale,
    z: ZONE_Z.hand + placement.slot,
  };
}

/**
 * The upright box a whole fan covers, relative to its lowest card's centre.
 *
 * Rotation is what makes this worth computing rather than assuming: a card
 * turned by `a` degrees stands `h·cos(a) + w·sin(a)` tall, so the outermost
 * cards of a wide fan reach well past the height of any single one of them.
 */
function fanExtent(
  slots: { angle: number; y: number }[],
  dip: number,
  cardWidth: number,
  cardHeight: number,
): { top: number; bottom: number } {
  let top = Infinity;
  let bottom = -Infinity;
  for (const slot of slots) {
    const radians = (Math.abs(slot.angle) * Math.PI) / 180;
    const half = (cardHeight * Math.cos(radians) + cardWidth * Math.sin(radians)) / 2;
    const y = -(dip - slot.y);
    top = Math.min(top, y - half);
    bottom = Math.max(bottom, y + half);
  }
  return Number.isFinite(top) ? { top, bottom } : { top: -cardHeight / 2, bottom: cardHeight / 2 };
}

function trickTransform(placement: Placement, metrics: SceneMetrics): CardTransform {
  const scale = ZONE_SCALE.trick;
  const rect = metrics.trick;
  if (!rect) return { x: 0, y: 0, rotate: 0, scale, z: ZONE_Z.trick };

  const centre = centreOf(rect);
  const cardWidth = metrics.cardWidth;
  const count = placement.count;
  const groups = placement.groups ?? 1;
  const group = placement.group ?? 0;

  let x: number;
  if (metrics.trickOpen) {
    // Opened for reading: every card in the trick on one line at the raised
    // size, a little air between combos, and the whole line centred.
    //
    // Laid out from the trick as a whole. Each combo used to be spaced by its
    // *own* width, so a four of a kind among singles was thrown far off to one
    // side — away from its caption, stretching the plate behind it.
    //
    // Centre to centre, a step clears a whole card plus a little air. Using
    // the gap alone stacked a combo's cards six pixels apart.
    const index = placement.trickIndex ?? placement.slot;
    const total = placement.trickCount ?? count;
    const naturalStep = cardWidth * CARD_SCALE.large * 1.08;
    const naturalGap = cardWidth * 0.5;
    const naturalWidth = (total - 1) * naturalStep + (groups - 1) * naturalGap;
    // A long trick is squeezed to fit the table rather than running off it.
    const room = Math.max(0, metrics.layer.width - cardWidth * CARD_SCALE.large - cardWidth);
    const fit = naturalWidth > room && naturalWidth > 0 ? room / naturalWidth : 1;
    const step = naturalStep * fit;
    const gap = naturalGap * fit;
    x = centre.x + index * step + group * gap - ((total - 1) * step + (groups - 1) * gap) / 2;
  } else {
    // Closed: one layered row, half a card apart. The standing combo is pinned
    // to the middle of the zone and everything it beat trails away to its
    // left, so the combo that matters never moves as the trick grows.
    const advance = cardWidth * 0.5;
    const index = placement.trickIndex ?? placement.slot;
    const anchor = placement.anchorIndex ?? index;
    x = centre.x + (index - anchor) * advance;
  }

  const standing = group === groups - 1;
  // Opened, the whole set rises to make room for the captions beneath it.
  const lift = metrics.trickOpen ? TRICK_LABEL_ROOM : standing ? 5 : 0;
  return {
    x: x - metrics.layer.x,
    y: centre.y - metrics.layer.y - lift,
    rotate: 0,
    scale: metrics.trickOpen ? CARD_SCALE.large : standing ? scale : scale * 0.94,
    // Later combos sit above earlier ones, and within a combo the cards layer
    // left to right, so the row reads as one stack.
    z: (metrics.trickOpen ? TRICK_OPEN_Z + 10 : ZONE_Z.trick) + group * 10 + placement.slot,
  };
}

/** How many cards the pile visibly thickens by; later cards land on the same height. */
const PILE_STEPS = 13;

/** The furthest a discarded card turns either way, in degrees. */
const PILE_TURN = 10;

/**
 * A fixed scatter in −1..1 for one card: the same card always lands the same
 * way, so the pile never twitches between renders, but neighbours differ.
 */
function scatter(slot: number, salt: number): number {
  const s = Math.sin((slot + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

function discardTransform(placement: Placement, metrics: SceneMetrics): CardTransform {
  const scale = ZONE_SCALE.discard;
  const rect = metrics.discard;
  if (!rect) return { x: 0, y: 0, rotate: 0, scale, z: ZONE_Z.discard };

  const centre = centreOf(rect);
  // One art pixel of the card, in layout pixels: cards are authored 22 wide.
  const px = metrics.cardWidth / 22;
  // A messy pile, not a staircase: each card lands roughly on top of the last,
  // turned a little one way or the other and nudged a pixel or two off square.
  // The pile only thickens slightly as it grows, rather than climbing away.
  const rise = Math.min(placement.slot, PILE_STEPS) * 0.25 * px;
  return {
    x: centre.x - metrics.layer.x + scatter(placement.slot, 1) * 2 * px,
    y: centre.y - metrics.layer.y + scatter(placement.slot, 2) * 1.5 * px - rise,
    rotate: scatter(placement.slot, 3) * PILE_TURN,
    scale,
    // Kept below the hands' layer however tall the pile grows; cards sharing
    // the top layer stack in the order they arrived.
    z: ZONE_Z.discard + Math.min(placement.slot, 9),
  };
}
