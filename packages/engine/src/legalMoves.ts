import { enumerateCombos } from './combos.js';
import { canBeat, getForcedBustOptions } from './compareCombos.js';
import { type Card, type Combo, DEFAULT_RULE_CONFIG, type RuleConfig, cardValue } from './types.js';

export type Move = { kind: 'PLAY'; combo: Combo } | { kind: 'PASS' };

/**
 * Returns every combo `hand` could legally play against `pile`.
 *
 * `pile === null` means this player is leading a fresh trick: any combo the
 * hand can form is legal, and — separately, per orchestrator rules — passing
 * is not allowed when leading.
 *
 * `pile !== null`: normal beats are legal UNLESS `pile` is a Two-combo and the
 * hand holds a qualifying bomb, in which case ONLY the forcing bomb(s) are
 * legal (9.5) — the player cannot choose a normal counter or pass instead.
 */
export function getLegalMoves(hand: Card[], pile: Combo | null, rules: RuleConfig = DEFAULT_RULE_CONFIG): Combo[] {
  const available = enumerateCombos(hand, rules);
  if (pile === null) return available;

  const forced = getForcedBustOptions(pile, available, rules);
  if (forced.length > 0) return forced;

  return available.filter((candidate) => canBeat(pile, candidate, rules));
}

/** True when this seat is leading a fresh trick and therefore cannot pass. */
export function mustPlay(pile: Combo | null): boolean {
  return pile === null;
}

/**
 * The forced-opening move for a starting player (9.1): their single lowest
 * card in hand. This is always legal, and — for the very first game — the
 * 3-of-Spades holder's lowest card is guaranteed to be the 3 of Spades itself,
 * since it is the lowest card in the entire deck.
 */
export function getForcedLowestSingle(hand: Card[]): Combo {
  const lowest = lowestCard(hand);
  return { type: 'SINGLE', cards: [lowest], strength: cardValue(lowest) };
}

/**
 * The lowest card in a hand — the card an opening play must contain (9.1).
 *
 * Does not assume the hand is sorted: piles are dealt in shuffle order now, so
 * a hand is only sorted once the engine has rebuilt it after a play.
 */
export function lowestCard(hand: Card[]): Card {
  return hand.reduce((min, c) => (cardValue(c) < cardValue(min) ? c : min));
}

/** Every legal opening combo: anything the hand can form that contains `card` (9.1). */
export function openingMoves(hand: Card[], card: Card, rules: RuleConfig = DEFAULT_RULE_CONFIG): Combo[] {
  return enumerateCombos(hand, rules).filter((combo) =>
    combo.cards.some((c) => c.rank === card.rank && c.suit === card.suit),
  );
}
