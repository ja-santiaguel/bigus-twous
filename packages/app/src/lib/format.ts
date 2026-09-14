import type { Card, Combo, ComboType, Suit } from '@big-two/engine';

/**
 * Turning engine vocabulary into player vocabulary.
 *
 * The engine speaks in locked terms (PAIR_CHAIN, FOUR_OF_A_KIND). Players
 * should never see those. Every string a player reads is produced here, so the
 * wording stays consistent between the banner, the log, and the buttons.
 */

export const SUIT_SYMBOL: Record<Suit, string> = {
  SPADE: '♠',
  CLUB: '♣',
  DIAMOND: '♦',
  HEART: '♥',
};

/** Suits are ranked Spade < Club < Diamond < Heart (9.2) — red always beats black. */
export const SUIT_IS_RED: Record<Suit, boolean> = {
  SPADE: false,
  CLUB: false,
  DIAMOND: true,
  HEART: true,
};

export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

export function cardsLabel(cards: Card[]): string {
  return cards.map(cardLabel).join(' ');
}

const SUIT_NAME: Record<Suit, string> = { SPADE: 'spades', CLUB: 'clubs', DIAMOND: 'diamonds', HEART: 'hearts' };
const RANK_NAME: Partial<Record<Card['rank'], string>> = { J: 'jack', Q: 'queen', K: 'king', A: 'ace' };

/**
 * A card as it is said aloud, for assistive technology. "3♠" is how a card
 * looks, but a screen reader reads the symbol as "black spade suit"; this
 * names it the way a person at the table would.
 */
export function cardSpoken(card: Card): string {
  return `${RANK_NAME[card.rank] ?? card.rank} of ${SUIT_NAME[card.suit]}`;
}

export function cardsSpoken(cards: Card[]): string {
  return cards.map(cardSpoken).join(', ');
}

const COMBO_NAMES: Record<ComboType, string> = {
  SINGLE: 'Single',
  PAIR: 'Pair',
  TRIPLE: 'Triple',
  STRAIGHT: 'Straight',
  FOUR_OF_A_KIND: 'Four of a kind',
  PAIR_CHAIN: 'Pair chain',
};

/** e.g. "Pair chain (3)", "Straight (5)", "Four of a kind". */
export function comboLabel(combo: Combo): string {
  const name = COMBO_NAMES[combo.type];
  return combo.length ? `${name} (${combo.length})` : name;
}

/** Screen position of a seat relative to the viewer, who always sits at the bottom. */
export type SeatPosition = 'bottom' | 'left' | 'top' | 'right';

/**
 * Seat order runs clockwise on screen: bottom, left, top, right. That matches
 * the engine's ascending turn order, so a seat's offset from the viewer is
 * also its distance in turn order.
 */
const POSITIONS: SeatPosition[] = ['bottom', 'left', 'top', 'right'];

export function seatPosition(seat: number, viewerSeat: number, seatCount = 4): SeatPosition {
  return POSITIONS[(seat - viewerSeat + seatCount) % seatCount]!;
}

/**
 * Seats are named by number, not by where they happen to sit on screen.
 *
 * The board always rotates so you are at the bottom, which means a positional
 * name like "Across" describes a different person depending on where you sat
 * down — and describes nobody consistently once there is more than one human
 * at the table. A seat number is stable for everyone looking at the same game,
 * which is what a shared table needs.
 */
export function seatName(seat: number): string {
  return `Seat ${seat + 1}`;
}

/**
 * What to call a seat, preferring the name of the person in it.
 *
 * A seat number is the right fallback and the wrong first choice. It is stable
 * for everyone looking at the same game, which is why it beats a positional
 * name — but at a table you shared with three friends, "Seat 3 leads the
 * trick" is a sentence about furniture. Once somebody has told the table who
 * they are, that is who they are.
 *
 * The `(you)` marker stays regardless. It is the one label the board is
 * describing from a particular point of view, and dropping it because a person
 * has a name would lose the only thing that orients them.
 */
export function personName(seat: number, viewerSeat: number, names: ReadonlyMap<number, string>): string {
  const given = names.get(seat)?.trim();
  const base = given && given.length > 0 ? given : seatName(seat);
  return seat === viewerSeat ? `${base} (you)` : base;
}
