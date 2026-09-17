import { describe, expect, it } from 'vitest';
import { cardId, detectCombo, type Card } from '@big-two/engine';
import { buildScene, placeholderId, type SceneInput } from '../src/lib/cardScene.js';
import { openTrickLayout, transformFor, TRICK_OPEN_Z, ZONE_SCALE, type SceneMetrics } from '../src/lib/zoneGeometry.js';
import { CARD_SCALE } from '../src/design/cardScale.js';
import type { TrickPlay } from '../src/lib/tableView.js';

/**
 * The scene model, tested without a DOM.
 *
 * Splitting "where does a card belong" from "where is that on screen" is what
 * makes this possible — and it is the reason the layout can be reasoned about
 * at all. Every animation bug this replaces came from geometry that could only
 * be checked by looking at it.
 */

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const combo = (...cards: Card[]) => detectCombo(cards)!;
const SEATS = ['seat-0', 'seat-1', 'seat-2', 'seat-3'];

function scene(overrides: Partial<SceneInput> = {}) {
  return buildScene({
    humanSeat: 0,
    seatIds: SEATS,
    handCards: [],
    opponentCounts: new Map(),
    trickPlays: [],
    mound: [],
    ...overrides,
  });
}

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

/** Thirteen singles, one after another — a long exchange. */
function longTrick(): TrickPlay[] {
  const suits = ['SPADE', 'CLUB', 'DIAMOND', 'HEART'] as const;
  const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as const;
  return ranks.map((rank, i) => ({
    playerId: SEATS[i % 4]!,
    combo: combo(c(rank, suits[i % 4]!)),
    isActive: i === ranks.length - 1,
  }));
}

function metrics(overrides: Partial<SceneMetrics> = {}): SceneMetrics {
  return {
    layer: rect(0, 0, 1000, 900),
    hands: new Map([
      [0, rect(200, 700, 600, 140)],
      [1, rect(20, 380, 160, 80)],
      [2, rect(420, 60, 160, 80)],
      [3, rect(820, 380, 160, 80)],
    ]),
    trick: rect(400, 350, 200, 140),
    discard: rect(680, 350, 90, 130),
    cardWidth: 66,
    cardHeight: 93,
    viewerSeat: 0,
    trickOpen: false,
    ...overrides,
  };
}

describe('buildScene', () => {
  it('gives every card in the viewer hand a real identity and a face-up placement', () => {
    const hand = [c('3', 'SPADE'), c('9', 'HEART')];
    const entities = scene({ handCards: hand });

    expect(entities).toHaveLength(2);
    expect(entities.map((e) => e.id)).toEqual(hand.map(cardId));
    for (const e of entities) {
      expect(e.card).not.toBeNull();
      expect(e.placement).toMatchObject({ zone: 'hand', seat: 0, faceUp: true, count: 2 });
    }
  });

  it('never gives an opponent card an identity', () => {
    const entities = scene({ opponentCounts: new Map([[2, 5]]) });

    expect(entities).toHaveLength(5);
    for (const [slot, e] of entities.entries()) {
      // This is the multiplayer guarantee, not a rendering detail: the client
      // cannot leak what it was never told.
      expect(e.card).toBeNull();
      expect(e.id).toBe(placeholderId(2, slot));
      expect(e.placement).toMatchObject({ zone: 'hand', seat: 2, faceUp: false });
    }
  });

  it('a card keeps one id as it moves from a hand to the table', () => {
    const card = c('K', 'DIAMOND');
    const inHand = scene({ handCards: [card] })[0]!;
    const played = scene({
      handCards: [],
      trickPlays: [{ playerId: 'seat-1', combo: combo(card), isActive: true }],
    })[0]!;

    // Same entity, different placement — which is the whole premise.
    expect(played.id).toBe(inHand.id);
    expect(inHand.placement.zone).toBe('hand');
    expect(played.placement.zone).toBe('trick');
  });

  it('anchors the closed trick on the middle of the standing combo', () => {
    const plays: TrickPlay[] = [
      { playerId: 'seat-1', combo: combo(c('4', 'SPADE'), c('4', 'HEART')), isActive: false },
      { playerId: 'seat-2', combo: combo(c('9', 'SPADE'), c('9', 'HEART')), isActive: true },
    ];
    const entities = scene({ trickPlays: plays });

    const indices = entities.map((e) => e.placement.trickIndex);
    expect(indices).toEqual([0, 1, 2, 3]);
    // Standing combo occupies 2 and 3, so its middle is 2.5.
    for (const e of entities) expect(e.placement.anchorIndex).toBe(2.5);
  });

  it('enters a revealed opponent card from that opponent hand, and its own from nowhere', () => {
    const plays: TrickPlay[] = [
      { playerId: 'seat-3', combo: combo(c('7', 'CLUB')), isActive: false },
      { playerId: 'seat-0', combo: combo(c('8', 'CLUB')), isActive: true },
    ];
    const [fromOpponent, mine] = scene({ trickPlays: plays });

    expect(fromOpponent!.enterFrom).toMatchObject({ zone: 'hand', seat: 3, faceUp: false });
    // The viewer's own card was already on screen in their hand, so it has
    // somewhere to travel from and needs no entrance.
    expect(mine!.enterFrom).toBeUndefined();
  });

  it('builds the discard pile from the real cards, face down, in the order they arrived', () => {
    const played = [c('2', 'HEART'), c('5', 'CLUB'), c('9', 'SPADE')];
    const entities = scene({ mound: played });

    expect(entities.map((e) => e.id)).toEqual(played.map(cardId));
    entities.forEach((e, slot) => {
      expect(e.placement).toMatchObject({ zone: 'discard', slot, count: 3, faceUp: false });
    });
  });

  it('a card keeps one id as its trick is swept into the pile', () => {
    // One pile, made of the cards that went into it — not cards that vanish
    // on arrival while a separately drawn pile stands in for them.
    const card = c('Q', 'HEART');
    const inTrick = scene({ trickPlays: [{ playerId: 'seat-2', combo: combo(card), isActive: true }] })[0]!;
    const piled = scene({ mound: [card] })[0]!;

    expect(piled.id).toBe(inTrick.id);
    expect(piled.placement.zone).toBe('discard');
  });
});

describe('transformFor', () => {
  it('centres the viewer fan on its zone and curves it', () => {
    const hand = [c('3', 'SPADE'), c('9', 'HEART'), c('K', 'DIAMOND')];
    const entities = scene({ handCards: hand });
    const m = metrics();
    const xs = entities.map((e) => transformFor(e.placement, m).x);

    // Left to right, and symmetric about the zone's centre (500).
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
    expect(Math.round((xs[0]! + xs[2]!) / 2)).toBe(500);

    // The middle of the fan sits highest — a hand held in front of you.
    const ys = entities.map((e) => transformFor(e.placement, m).y);
    expect(ys[1]).toBeLessThan(ys[0]!);
    expect(ys[1]).toBeLessThan(ys[2]!);

    // And each card is rotated along the arc.
    const angles = entities.map((e) => transformFor(e.placement, m).rotate);
    expect(angles[0]).toBeLessThan(0);
    expect(angles[2]).toBeGreaterThan(0);
  });

  it('rests every zone on a whole fraction of the pixel scale', () => {
    // Non-integer resting scales are what turn pixel art to mush. Only the
    // flight between two zones is allowed off the grid.
    for (const scale of Object.values(ZONE_SCALE)) {
      expect(Number.isInteger(scale * 3)).toBe(true);
    }
  });

  it('stands the newest combo in the middle, and piles everything it beat beneath it', () => {
    const plays: TrickPlay[] = [
      { playerId: 'seat-1', combo: combo(c('4', 'SPADE')), isActive: false },
      { playerId: 'seat-2', combo: combo(c('6', 'SPADE')), isActive: false },
      { playerId: 'seat-3', combo: combo(c('9', 'SPADE')), isActive: true },
    ];
    const m = metrics();
    const t = scene({ trickPlays: plays }).map((e) => transformFor(e.placement, m));

    // Trick zone centre is 500, and the combo that stands sits square on it.
    expect(t[2]!.x).toBe(500);
    expect(t[2]!.rotate).toBe(0);
    // What it beat stays beneath it, like the discard pile — not trailing away.
    for (const beaten of [t[0]!, t[1]!]) {
      expect(Math.abs(beaten.x - 500)).toBeLessThan(m.cardWidth * 0.2);
      expect(beaten.z).toBeLessThan(t[2]!.z);
    }
  });

  it('keeps a long closed trick within its own footprint', () => {
    const m = metrics();
    const xs = scene({ trickPlays: longTrick() }).map((e) => transformFor(e.placement, m).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(m.cardWidth * 0.5);
  });

  it('flattens your hand on a phone, so each card shows a wider strip to touch', () => {
    const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as const;
    const hand = ranks.map((rank) => c(rank, 'SPADE'));
    const narrow = { hands: new Map([[0, rect(10, 700, 370, 140)]]) };
    const layout = (compact: boolean) =>
      scene({ handCards: hand }).map((e) => transformFor(e.placement, metrics({ ...narrow, compact })));

    const strip = (compact: boolean) => layout(compact)[1]!.x - layout(compact)[0]!.x;
    expect(strip(true)).toBeGreaterThan(strip(false));
    expect(Math.max(...layout(true).map((t) => Math.abs(t.rotate)))).toBeLessThanOrEqual(6);
  });

  it('keeps a full opponent fan inside its narrow phone column', () => {
    const column = rect(12, 84, 112, 52);
    const phone = metrics({ compact: true, cardWidth: 36, cardHeight: 50, hands: new Map([[2, column]]) });
    const fan = scene({ opponentCounts: new Map([[2, 13]]) })
      .filter((e) => e.placement.zone === 'hand' && e.placement.seat === 2)
      .map((e) => transformFor(e.placement, phone));
    const half = (36 * ZONE_SCALE.opponentHand) / 2;

    expect(fan).toHaveLength(13);
    // Card centres plus half a card either side: the column the seat was given.
    expect(Math.min(...fan.map((t) => t.x)) - half).toBeGreaterThanOrEqual(column.x - 4);
    expect(Math.max(...fan.map((t) => t.x)) + half).toBeLessThanOrEqual(column.x + column.width + 4);
  });

  it('lifts the standing combo and sets the beaten ones back, only while closed', () => {
    const plays: TrickPlay[] = [
      { playerId: 'seat-1', combo: combo(c('4', 'SPADE')), isActive: false },
      { playerId: 'seat-3', combo: combo(c('9', 'SPADE')), isActive: true },
    ];
    const entities = scene({ trickPlays: plays });

    const closed = entities.map((e) => transformFor(e.placement, metrics({ trickOpen: false })));
    expect(closed[1]!.y).toBeLessThan(closed[0]!.y);
    expect(closed[0]!.scale).toBeLessThan(closed[1]!.scale);

    // Opened, they line up as one row at one size — the raised size, and the
    // gold edge is what marks the standing combo there.
    const open = entities.map((e) => transformFor(e.placement, metrics({ trickOpen: true })));
    expect(open[0]!.y).toBe(open[1]!.y);
    expect(open[0]!.scale).toBe(open[1]!.scale);
    expect(open[0]!.scale).toBe(CARD_SCALE.large);
    expect(open[0]!.x).toBeLessThan(open[1]!.x);
  });

  it('stacks zones in a sane order — discard under hands, trick over both', () => {
    const handZ = transformFor({ zone: 'hand', seat: 0, slot: 0, count: 1, faceUp: true }, metrics()).z;
    const trickZ = transformFor({ zone: 'trick', slot: 0, count: 1, faceUp: true }, metrics()).z;
    const discardZ = transformFor({ zone: 'discard', slot: 0, count: 1, faceUp: false }, metrics()).z;

    expect(discardZ).toBeLessThan(handZ);
    expect(handZ).toBeLessThan(trickZ);
  });

  it('piles discarded cards messily on top of each other, all under the hands', () => {
    const m = metrics();
    const handZ = transformFor({ zone: 'hand', seat: 0, slot: 0, count: 1, faceUp: true }, m).z;
    const pile = Array.from({ length: 40 }, (_, slot) =>
      transformFor({ zone: 'discard', slot, count: 40, faceUp: false }, m),
    );

    // Turned both ways, like a pile tossed together — not all leaning one way.
    expect(pile.some((t) => t.rotate > 2)).toBe(true);
    expect(pile.some((t) => t.rotate < -2)).toBe(true);
    // On top of each other: every card within a small fraction of a card of
    // the pile's centre, rather than climbing away up and to the right.
    const centre = { x: 680 + 90 / 2, y: 350 + 130 / 2 };
    for (const t of pile) {
      expect(Math.abs(t.x - centre.x)).toBeLessThan(m.cardWidth * 0.2);
      expect(Math.abs(t.y - centre.y)).toBeLessThan(m.cardWidth * 0.3);
      expect(t.z).toBeLessThan(handZ);
    }
    // Fixed per card, so the pile does not twitch between renders.
    expect(transformFor({ zone: 'discard', slot: 7, count: 8, faceUp: false }, m)).toEqual(pile[7]);
  });

  it('lays an opened trick out as one even line, whatever size each combo is', () => {
    // One four of a kind among singles used to be thrown far off to one side,
    // because each combo was spaced by its own width.
    const plays: TrickPlay[] = [
      { playerId: 'seat-1', combo: combo(c('3', 'SPADE')), isActive: false },
      { playerId: 'seat-2', combo: combo(c('2', 'SPADE')), isActive: false },
      {
        playerId: 'seat-3',
        combo: combo(c('6', 'SPADE'), c('6', 'CLUB'), c('6', 'DIAMOND'), c('6', 'HEART')),
        isActive: true,
      },
    ];
    const m = metrics({ trickOpen: true, layer: rect(0, 0, 3000, 900) });
    const xs = scene({ trickPlays: plays }).map((e) => transformFor(e.placement, m).x);

    const steps = xs.slice(1).map((x, i) => x - xs[i]!);
    for (const step of steps) expect(step).toBeGreaterThan(0);
    // Between combos is a little wider than within one, never a chasm.
    expect(Math.max(...steps)).toBeLessThan(Math.min(...steps) * 2);
    // And the line is centred on the trick zone (centre 500).
    expect((xs[0]! + xs[xs.length - 1]!) / 2).toBeCloseTo(500, 6);
  });

  it('opens a long trick in a window of limited width, with the newest plays in view', () => {
    const m = metrics({ trickOpen: true, layer: rect(0, 0, 3000, 900) });
    const t = scene({ trickPlays: longTrick() }).map((e) => transformFor(e.placement, m));
    const layout = openTrickLayout(13, 13, m);

    // Even on a very wide table the window stops well short of the whole line.
    expect(layout.maxScroll).toBeGreaterThan(0);
    expect(layout.right - layout.left).toBeCloseTo(layout.viewport, 6);
    expect(layout.viewport).toBeLessThan(1000);
    // Newest in view; oldest faded out beyond the window's edge.
    expect(t[12]!.opacity).toBeCloseTo(1, 6);
    expect(t[0]!.opacity).toBe(0);
  });

  it('scrolls a long opened trick back to its oldest plays, and no further', () => {
    const far = metrics({ trickOpen: true, layer: rect(0, 0, 3000, 900), trickScroll: 1e6 });
    const t = scene({ trickPlays: longTrick() }).map((e) => transformFor(e.placement, far));
    const layout = openTrickLayout(13, 13, far);

    expect(layout.scroll).toBe(layout.maxScroll);
    expect(t[0]!.opacity).toBeCloseTo(1, 6);
    expect(t[12]!.opacity).toBe(0);
  });

  it('does not scroll or fade a trick that fits its window', () => {
    const m = metrics({ trickOpen: true, layer: rect(0, 0, 3000, 900) });
    const plays = longTrick().slice(0, 3);
    const t = scene({ trickPlays: plays }).map((e) => transformFor(e.placement, m));

    expect(openTrickLayout(3, 3, m).maxScroll).toBe(0);
    for (const card of t) expect(card.opacity).toBeUndefined();
  });

  it('lifts the opened trick above every other zone', () => {
    // The seats' fans are cards in this same layer. At the ordinary trick
    // height they painted straight over the read-out plate, so opening the
    // trick has to raise it clear of everything, not just of the cards it
    // shares a zone with.
    const open = metrics({ trickOpen: true });
    const trickZ = transformFor({ zone: 'trick', slot: 0, count: 1, faceUp: true }, open).z;
    const handZ = transformFor({ zone: 'hand', seat: 1, slot: 12, count: 13, faceUp: false }, open).z;

    expect(trickZ).toBeGreaterThan(handZ);
    expect(trickZ).toBeGreaterThan(TRICK_OPEN_Z);
  });

  it('sits a seat at the same height whatever it is holding', () => {
    // A rotated card is taller than the card is, and the spread — so the
    // overhang — grows with the number of cards until it caps. Sizing a fan as
    // "one card plus the arc" therefore made its height depend on how many
    // cards a seat happened to hold, so three seats in identical boxes sat at
    // three different heights and the fullest ones spilled onto the count
    // printed underneath.
    const m = metrics();
    const zone = m.hands.get(1)!;

    /** Centre of the upright box the fan actually covers, rotation included. */
    const coveredCentre = (count: number) => {
      let top = Infinity;
      let bottom = -Infinity;
      for (let slot = 0; slot < count; slot++) {
        const t = transformFor({ zone: 'hand', seat: 1, slot, count, faceUp: false }, m);
        const radians = (Math.abs(t.rotate) * Math.PI) / 180;
        const half = (m.cardHeight * t.scale * Math.cos(radians) + m.cardWidth * t.scale * Math.sin(radians)) / 2;
        top = Math.min(top, t.y - half);
        bottom = Math.max(bottom, t.y + half);
      }
      return (top + bottom) / 2;
    };

    const zoneCentre = zone.y + zone.height / 2;
    for (const count of [2, 3, 5, 8, 13]) {
      expect(coveredCentre(count)).toBeCloseTo(zoneCentre, 6);
    }
  });

  it('centres a combo caption between its cards, not on one of them', () => {
    // The middle of a pair falls *between* the two cards. Rounding to the
    // nearest real card put the caption under the left-hand one.
    const base = { zone: 'trick' as const, count: 2, group: 0, groups: 1, faceUp: true };
    const m = metrics({ trickOpen: true });
    const left = transformFor({ ...base, slot: 0 }, m).x;
    const right = transformFor({ ...base, slot: 1 }, m).x;
    const caption = transformFor({ ...base, slot: 0.5 }, m).x;

    expect(caption).toBeCloseTo((left + right) / 2, 5);
    expect(caption).toBeGreaterThan(left);
    expect(caption).toBeLessThan(right);
  });

  it('survives a zone that has not been measured yet', () => {
    // First paint: the anchors exist but have not reported their boxes. A
    // missing zone must not throw or produce NaN, or the very first render of
    // a round takes the board down.
    const bare = metrics({ hands: new Map(), trick: null, discard: null });
    for (const zone of ['hand', 'trick', 'discard'] as const) {
      const t = transformFor({ zone, slot: 0, count: 1, faceUp: true }, bare);
      expect(Number.isFinite(t.x)).toBe(true);
      expect(Number.isFinite(t.y)).toBe(true);
      expect(Number.isFinite(t.scale)).toBe(true);
    }
  });
});
