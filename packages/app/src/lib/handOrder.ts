import { RANK_ORDER, SUIT_ORDER, cardId, cardValue, type Card } from '@big-two/engine';
import { planHand } from '@big-two/ai';

/**
 * How the player's hand is arranged.
 *
 * Order is a player's own working memory made visible, so it is stored as an
 * explicit list of card ids rather than recomputed from the cards each render.
 * Dragging a card rewrites that list; sorting replaces it wholesale.
 */
export type SortMode = 'rank' | 'groups';

export const SORT_MODES: SortMode[] = ['rank', 'groups'];

export const SORT_LABELS: Record<SortMode, string> = {
  rank: 'Rank',
  groups: 'Groups',
};

export const SORT_HINTS: Record<SortMode, string> = {
  rank: 'Sorted by rank — pairs and four of a kind sit together.',
  groups: 'Grouped into the combinations this hand can play.',
};

export function nextSortMode(mode: SortMode): SortMode {
  return SORT_MODES[(SORT_MODES.indexOf(mode) + 1) % SORT_MODES.length]!;
}

export function sortCards(cards: Card[], mode: SortMode): Card[] {
  switch (mode) {
    case 'rank':
      // cardValue is rank-major with suit as the tiebreaker — the engine's own
      // ordering, and the one that puts same-rank cards next to each other.
      return [...cards].sort((a, b) => cardValue(a) - cardValue(b));

    case 'groups':
      return sortByGroups(cards);
  }
}

/**
 * Lays the hand out as the combinations it can actually play, using the same
 * decomposition the CPUs use to plan their own hands. Spotting that you are
 * holding a five-card straight is the hardest part of Big Two for a new
 * player, and this is the one view that shows it.
 */
function sortByGroups(cards: Card[]): Card[] {
  const plan = planHand(cards);

  const multi = plan.combos.filter((c) => c.cards.length > 1);
  const singles = plan.combos.filter((c) => c.cards.length === 1);

  // Biggest structures first, then loose cards low to high — so the cards you
  // are most likely to shed sit at the end of the fan, nearest your thumb.
  multi.sort((a, b) => b.cards.length - a.cards.length || a.strength - b.strength);
  singles.sort((a, b) => a.strength - b.strength);

  return [...multi, ...singles].flatMap((combo) =>
    [...combo.cards].sort((a, b) => cardValue(a) - cardValue(b)),
  );
}

/**
 * Reconciles a stored order with the hand as it actually is now.
 *
 * Cards leave the hand when they are played, and a new round replaces them
 * entirely. Rather than keeping the two in lockstep everywhere, the order is
 * treated as a preference that is filtered against reality on read: known ids
 * keep their position, anything unrecognised is appended.
 */
export function applyOrder(cards: Card[], order: string[]): Card[] {
  const byId = new Map(cards.map((card) => [cardId(card), card]));
  const result: Card[] = [];

  for (const id of order) {
    const card = byId.get(id);
    if (card) {
      result.push(card);
      byId.delete(id);
    }
  }
  // Anything the order did not know about (a fresh deal) goes on the end.
  result.push(...byId.values());
  return result;
}

/** Moves one card to a new index, returning the new id order. */
export function moveCard(order: string[], fromId: string, toIndex: number): string[] {
  return order.includes(fromId) ? moveCards(order, [fromId], toIndex) : order;
}

/**
 * Moves a group of cards to a new index, keeping their relative order.
 *
 * `toIndex` is an index into the order *with the moving cards already taken
 * out*, which is what a drag actually means: you pull cards out of the fan and
 * the gap you are aiming at is a gap in what remains.
 */
export function moveCards(order: string[], ids: string[], toIndex: number): string[] {
  const moving = new Set(ids);
  const taken = order.filter((id) => moving.has(id));
  if (taken.length === 0) return order;

  const rest = order.filter((id) => !moving.has(id));
  const at = Math.max(0, Math.min(rest.length, toIndex));
  return [...rest.slice(0, at), ...taken, ...rest.slice(at)];
}
