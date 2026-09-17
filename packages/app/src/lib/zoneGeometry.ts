import { fanSlots, PLAYER_FAN } from '../components/card/fanGeometry.js';
import { CARD_SCALE } from '../design/cardScale.js';
import type { Placement } from './cardScene.js';

/** Your hand on a phone: barely curved, so width goes to the cards rather than to their lean. */
const COMPACT_PLAYER_FAN = { ...PLAYER_FAN, stepDegrees: 1.2, maxSpread: 12, radius: 1600 };

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
  /**
   * How far the opened trick is scrolled back from its newest play, in pixels.
   * Zero shows the newest plays; a long trick scrolls toward its oldest.
   */
  trickScroll?: number;
  /** The phone layout: a flatter hand, so more of each card is there to touch. */
  compact?: boolean;
}

export interface CardTransform {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  z: number;
  /** Below 1 only where a card is fading out at the edge of a scrolling trick. */
  opacity?: number;
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
export function fanGap(count: number, available: number, cardWidth: number, endAngle = 20, minGap = 11): number {
  if (count <= 1 || available <= 0) return cardWidth * 0.72;
  // A rotated card is wider than its own width: the end cards sit at roughly
  // half the spread and each overhangs by height x sin(angle). Ignoring that is
  // what pushes the outermost cards off the edge of a narrow screen.
  const cardHeight = cardWidth * 1.4;
  const overhang = cardHeight * Math.sin((endAngle * Math.PI) / 180) * 2;
  const usable = available - cardWidth - overhang;
  return Math.max(minGap, Math.min(cardWidth * 0.72, usable / (count - 1)));
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
  // On a phone the hand is nearly flat: an arc's rotation spends width on
  // overhang, and width is what each card's touchable strip is made of.
  // Every hand at the table fans the same way — the same spread and the same
  // curve — so three opponents read as three people holding cards like you do.
  // The radius is scaled to the size a seat's cards are drawn at, or a smaller
  // card on the same radius would sit on a flatter-looking arc.
  const fan = metrics.compact ? COMPACT_PLAYER_FAN : PLAYER_FAN;
  // Fitted to the seat's box, as your own fan is fitted to yours. On a phone an
  // opponent's column is narrow enough that thirteen cards at the usual minimum
  // gap ran into the next seat, so their cards may close up further.
  const minGap = own ? 11 : 4;
  const roomy = fanGap(placement.count, rect.width, cardWidth, fan.maxSpread / 2, minGap);
  // A hand squeezed into less room than it wants fans less, as a hand held
  // closer does: the spread shrinks with the gap. Keeping the full spread on a
  // squeezed fan turned thirteen cards in a narrow seat into a tight clump of
  // steep angles; flattening it all the way lost the look of a hand. So a
  // squeezed fan keeps at least half its arc, and a fan with room keeps it all.
  const openness = 0.5 + 0.5 * Math.min(1, roomy / (cardWidth * 0.72));
  const spread = fan.maxSpread * openness;
  const slots = fanSlots(placement.count, {
    ...fan,
    stepDegrees: fan.stepDegrees * openness,
    maxSpread: spread,
    radius: fan.radius * (scale / ZONE_SCALE.hand),
    gap: fanGap(placement.count, rect.width, cardWidth, spread / 2, minGap),
  });
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

/** An opened trick shows at most this many card steps past its first card before it scrolls. */
const OPEN_MAX_STEPS = 7;

/** How an opened trick is laid out: one line, a window onto it, and how far the window can move. */
export interface OpenTrickLayout {
  /** Centre to centre between neighbouring cards. */
  step: number;
  /** Extra air between one combo and the next. */
  gap: number;
  /** Centre to centre, first card to last. */
  span: number;
  /** Width of the visible window, a card's width included. */
  viewport: number;
  /** How far the window can scroll back from the newest play. */
  maxScroll: number;
  /** The scroll in effect, clamped to what the trick allows. */
  scroll: number;
  /** The window's edges, in the card layer's coordinates. */
  left: number;
  right: number;
}

/**
 * The opened trick: every card on one line, seen through a window of limited
 * width.
 *
 * A long run of plays used to be squeezed or spread until it crossed the whole
 * table. Now the window stops at a comfortable width and the line scrolls
 * inside it — starting at the newest plays, which are the ones being answered —
 * and cards fade at the window's edges, which is what says there is more.
 */
export function openTrickLayout(total: number, groups: number, metrics: SceneMetrics): OpenTrickLayout {
  const cardWidth = metrics.cardWidth * CARD_SCALE.large;
  const step = cardWidth * 1.08;
  const gap = metrics.cardWidth * 0.5;
  const span = Math.max(0, total - 1) * step + Math.max(0, groups - 1) * gap;
  const content = span + cardWidth;
  const room = Math.max(
    cardWidth,
    Math.min(metrics.layer.width - metrics.cardWidth, cardWidth + OPEN_MAX_STEPS * step),
  );
  const viewport = Math.min(content, room);
  const maxScroll = Math.max(0, content - viewport);
  const scroll = Math.min(Math.max(metrics.trickScroll ?? 0, 0), maxScroll);
  const centreX = metrics.trick ? metrics.trick.x + metrics.trick.width / 2 : 0;
  return {
    step,
    gap,
    span,
    viewport,
    maxScroll,
    scroll,
    left: centreX - viewport / 2 - metrics.layer.x,
    right: centreX + viewport / 2 - metrics.layer.x,
  };
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
  const index = placement.trickIndex ?? placement.slot;
  const standing = group === groups - 1;
  // One art pixel of the card, in layout pixels: cards are authored 22 wide.
  const px = cardWidth / 22;

  let x: number;
  let settle = 0;
  let rotate = 0;
  let opacity: number | undefined;
  if (metrics.trickOpen) {
    // Opened for reading: every card on one line at the raised size, a little
    // air between combos. Laid out from the trick as a whole, so combos of any
    // size sit evenly and each caption stays under its own cards.
    const layout = openTrickLayout(placement.trickCount ?? count, groups, metrics);
    const along = index * layout.step + group * layout.gap;
    const large = cardWidth * CARD_SCALE.large;
    x =
      layout.maxScroll === 0
        ? centre.x - layout.span / 2 + along
        : centre.x + layout.viewport / 2 - large / 2 - (layout.span - along) + layout.scroll;
    if (layout.maxScroll > 0) {
      const local = x - metrics.layer.x;
      const overflow = Math.max(layout.left - (local - large / 2), local + large / 2 - layout.right, 0);
      opacity = Math.min(1, Math.max(0, 1 - overflow / (large * 0.6)));
    }
  } else if (standing) {
    // Closed: the combo that stands is spread half a card apart and pinned to
    // the middle of the zone, exactly where the eye expects the play to beat.
    const anchor = placement.anchorIndex ?? index;
    x = centre.x + (index - anchor) * cardWidth * 0.5;
  } else {
    // Everything it beat is a messy pile beneath it, like the discard pile:
    // turned a little either way and nudged off square, but never spreading.
    // A long exchange used to trail half a card per play across the table.
    x = centre.x + scatter(index, 4) * 3 * px;
    settle = px + scatter(index, 5) * px;
    rotate = scatter(index, 6) * PILE_TURN;
  }

  // Opened, the whole set rises to make room for the captions beneath it.
  // Closed, the standing combo rests on the row's centre line — the same line
  // the discard pile beside it is centred on.
  const lift = metrics.trickOpen ? TRICK_LABEL_ROOM : 0;
  return {
    x: x - metrics.layer.x,
    y: centre.y - metrics.layer.y - lift + settle,
    rotate,
    scale: metrics.trickOpen ? CARD_SCALE.large : standing ? scale : scale * 0.94,
    // Later combos sit above earlier ones, and within a combo the cards layer
    // left to right, so the row reads as one stack.
    z: (metrics.trickOpen ? TRICK_OPEN_Z + 10 : ZONE_Z.trick) + group * 10 + placement.slot,
    ...(opacity !== undefined ? { opacity } : {}),
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
  // Centred on its anchor as a thickened pile, so it shares a centre line with
  // the trick. A fixed offset rather than one from the pile's current size: that
  // would move every card a fraction each time another landed.
  const height = PILE_STEPS * 0.25 * px;
  return {
    x: centre.x - metrics.layer.x + scatter(placement.slot, 1) * 2 * px,
    y: centre.y - metrics.layer.y + scatter(placement.slot, 2) * 1.5 * px - rise + height / 2,
    rotate: scatter(placement.slot, 3) * PILE_TURN,
    scale,
    // Kept below the hands' layer however tall the pile grows; cards sharing
    // the top layer stack in the order they arrived.
    z: ZONE_Z.discard + Math.min(placement.slot, 9),
  };
}
