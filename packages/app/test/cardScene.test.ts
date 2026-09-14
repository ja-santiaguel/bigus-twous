import { describe, expect, it } from 'vitest';
import { cardId, detectCombo, type Card } from '@big-two/engine';
import { buildScene, placeholderId, type SceneInput } from '../src/lib/cardScene.js';
import { transformFor, TRICK_OPEN_Z, ZONE_SCALE, type SceneMetrics } from '../src/lib/zoneGeometry.js';
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
    settling: [],
    ...overrides,
  });
}

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

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

  it('sends settling cards to the discard face down', () => {
    const entities = scene({ settling: [c('2', 'HEART')] });
    expect(entities[0]!.placement).toMatchObject({ zone: 'discard', faceUp: false });
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

  it('puts the standing combo at the centre of the trick zone, beaten cards to its left', () => {
    const plays: TrickPlay[] = [
      { playerId: 'seat-1', combo: combo(c('4', 'SPADE')), isActive: false },
      { playerId: 'seat-2', combo: combo(c('6', 'SPADE')), isActive: false },
      { playerId: 'seat-3', combo: combo(c('9', 'SPADE')), isActive: true },
    ];
    const entities = scene({ trickPlays: plays });
    const m = metrics();
    const xs = entities.map((e) => transformFor(e.placement, m).x);

    // Trick zone centre is 500.
    expect(xs[2]).toBe(500);
    expect(xs[1]).toBeLessThan(xs[2]!);
    expect(xs[0]).toBeLessThan(xs[1]!);
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
        const half =
          (m.cardHeight * t.scale * Math.cos(radians) + m.cardWidth * t.scale * Math.sin(radians)) / 2;
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
