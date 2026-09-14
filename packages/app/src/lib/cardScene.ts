import { cardId, type Card, type PlayerId } from '@big-two/engine';
import type { TrickPlay } from './tableView.js';

/**
 * What is on the table, as a flat list of card entities.
 *
 * The whole board is one layer of cards. A zone does not *own* its cards; a
 * zone is a place a card can be, and moving between zones is a change of
 * placement, not a change of component. That is the difference between a card
 * that travels and a card that is destroyed in one React tree and recreated in
 * another — which is what every ghost, double-render and mis-fired flight in
 * this UI came down to.
 *
 * This module answers "where does every card belong", from state alone. It
 * knows nothing about pixels; `zoneGeometry` turns a placement into a
 * transform. Keeping the two apart is what lets the placement rules be tested
 * without a DOM, and what keeps a resize from being a game-state concern.
 *
 * **Multiplayer:** placements are derived from the redacted `PlayerView` and
 * from local intent (what you have staged, what you are dragging) — never from
 * anything only this client could know about another player. An opponent's
 * cards are placeholders precisely because their identity is not ours to hold.
 */

export type ZoneKind = 'hand' | 'trick' | 'discard';

export interface Placement {
  zone: ZoneKind;
  /** Seat index, for `hand`. Seat order is the engine's, not screen position. */
  seat?: number;
  /** Index within its group. */
  slot: number;
  /** How many cards share the group — fans need to know how wide to spread. */
  count: number;
  /** Which combo within the trick, and how many combos the trick holds. */
  group?: number;
  groups?: number;
  /** Index across the *whole* trick, not just within the combo. */
  trickIndex?: number;
  /**
   * The index that should sit at the centre of the trick zone — the middle of
   * the standing combo. Carried here so the layout stays a pure function of
   * the placement rather than something the view has to measure and correct
   * afterwards, which is how the old anchor managed to run away.
   */
  anchorIndex?: number;
  /** A face-down card renders no identity at all, not even hidden in the DOM. */
  faceUp: boolean;
}

export interface CardEntity {
  /** Stable for the life of the card on screen. Placeholders get synthetic ids. */
  id: string;
  /**
   * The card, or null for a placeholder.
   *
   * Opponent hands hold placeholders. We must not know which card leaves an
   * opponent's hand until they play it, so their fans are made of anonymous
   * slots — and the reveal happens at the moment the engine reveals it, which
   * is exactly when a card is physically turned over.
   */
  card: Card | null;
  placement: Placement;
  /**
   * Where this entity should appear from, when it did not exist a moment ago.
   *
   * Expressed as a placement rather than a pixel offset, so an entrance is
   * measured by the same geometry as every resting position. A card revealed
   * from an opponent's hand enters from that hand; nothing has to guess at a
   * direction or a distance.
   */
  enterFrom?: Placement;
}

/** Synthetic id for one anonymous slot in a seat's fan. */
export function placeholderId(seat: number, slot: number): string {
  return `seat${seat}:slot${slot}`;
}

export interface SceneInput {
  /** Seat the viewer occupies — their hand is the only one dealt face up. */
  humanSeat: number;
  /** Seat ids in engine order, so a player id can be resolved to a seat. */
  seatIds: PlayerId[];
  /** The viewer's hand, already in their chosen arrangement. */
  handCards: Card[];
  /** How many cards each opponent holds, by seat. */
  opponentCounts: Map<number, number>;
  /** Combos on the table, oldest first. */
  trickPlays: TrickPlay[];
  /** Cards on their way to the discard pile, if a trick has just closed. */
  settling: Card[];
}

/**
 * Builds the complete list of card entities for the current state.
 *
 * Order is not significant — the layer positions everything absolutely — but it
 * is kept stable so React reconciles by key rather than by position.
 */
export function buildScene(input: SceneInput): CardEntity[] {
  const entities: CardEntity[] = [];

  // The viewer's own hand: real cards, face up.
  input.handCards.forEach((card, slot) => {
    entities.push({
      id: cardId(card),
      card,
      placement: {
        zone: 'hand',
        seat: input.humanSeat,
        slot,
        count: input.handCards.length,
        faceUp: true,
      },
    });
  });

  // Opponent hands: anonymous slots, face down.
  for (const [seat, count] of input.opponentCounts) {
    for (let slot = 0; slot < count; slot++) {
      entities.push({
        id: placeholderId(seat, slot),
        card: null,
        placement: { zone: 'hand', seat, slot, count, faceUp: false },
      });
    }
  }

  // The trick. A combo played by an opponent enters from that opponent's fan,
  // so the card you watched leave their hand is the card that lands.
  // Index of the first card of the standing combo, and of its middle — the
  // point the closed trick is anchored on.
  const before = input.trickPlays.map((p) => p.combo.cards.length);
  const standingStart = before.slice(0, -1).reduce((a, b) => a + b, 0);
  const standingCount = before[before.length - 1] ?? 1;
  const anchorIndex = standingStart + (standingCount - 1) / 2;

  let trickIndex = 0;
  input.trickPlays.forEach((play, group) => {
    const seat = input.seatIds.indexOf(play.playerId);
    const fromOpponent = seat !== -1 && seat !== input.humanSeat;
    play.combo.cards.forEach((card, slot) => {
      entities.push({
        id: cardId(card),
        card,
        placement: {
          zone: 'trick',
          slot,
          count: play.combo.cards.length,
          group,
          groups: input.trickPlays.length,
          trickIndex: trickIndex++,
          anchorIndex,
          faceUp: true,
        },
        ...(fromOpponent
          ? {
              enterFrom: {
                zone: 'hand',
                seat,
                // The middle of their fan: we never knew which slot it came
                // from, and pretending otherwise would be a lie the game
                // cannot back up.
                slot: 0,
                count: 1,
                faceUp: false,
              },
            }
          : {}),
      });
    });
  });

  // Cards mid-flight into the discard pile. They exist only for the length of
  // that flight — see `settling` in the table screen — because the pile itself
  // is anonymous and must stay that way.
  input.settling.forEach((card, slot) => {
    entities.push({
      id: cardId(card),
      card,
      placement: { zone: 'discard', slot, count: input.settling.length, faceUp: false },
    });
  });

  return entities;
}
