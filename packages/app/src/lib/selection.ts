import { cardId, detectCombo, type Card, type Combo, type TurnConstraint } from '@big-two/engine';
import { cardLabel, comboLabel } from './format.js';

/**
 * Whether the cards a player has selected can actually be played, and — when
 * they cannot — one plain sentence explaining why.
 *
 * The "why" matters more than it looks. This ruleset has two states where the
 * Pass button disappears and most of the hand becomes unplayable (forced
 * opening, forced two-bust). Without an explanation the game simply looks
 * broken. Every message here is written from the player's side of the table.
 */
export type SelectionStatus =
  | { kind: 'EMPTY'; message: string }
  | { kind: 'NOT_A_COMBO'; message: string }
  | { kind: 'ILLEGAL'; message: string }
  | { kind: 'LEGAL'; combo: Combo; message: string };

/**
 * The legal move matching exactly this set of cards, or null.
 *
 * Both the Play button and drag-to-play need this, and they must agree — a
 * drop that looks valid but is refused by the engine is worse than one that
 * was never offered.
 */
export function matchLegalMove(cards: Card[], legalMoves: Combo[]): Combo | null {
  if (cards.length === 0) return null;
  const key = comboKey(cards);
  return legalMoves.find((m) => comboKey(m.cards) === key) ?? null;
}

export function comboKey(cards: Card[]): string {
  return cards.map(cardId).sort().join('|');
}

export function evaluateSelection(
  selection: Card[],
  legalMoves: Combo[],
  pile: Combo | null,
  constraint: TurnConstraint,
): SelectionStatus {
  if (selection.length === 0) {
    return { kind: 'EMPTY', message: turnPrompt(constraint, pile) };
  }

  const combo = detectCombo(selection);
  if (!combo) {
    return {
      kind: 'NOT_A_COMBO',
      message: 'Those cards do not form a combination you can play.',
    };
  }

  if (matchLegalMove(selection, legalMoves)) {
    return { kind: 'LEGAL', combo, message: comboLabel(combo) };
  }

  return { kind: 'ILLEGAL', combo, message: illegalReason(combo, pile, constraint) } as SelectionStatus;
}

/**
 * What this turn requires of you, independent of what you have selected.
 * The status line shows this; the tray shows the verdict on the selection.
 * Splitting them keeps each to one job instead of repeating the same sentence
 * in two places.
 */
export function turnPrompt(constraint: TurnConstraint, pile: Combo | null): string {
  switch (constraint.kind) {
    case 'FORCED_OPENING':
      return `Opening play — lead anything, as long as it includes your ${cardLabel(constraint.card)}.`;
    case 'FORCED_TWO_BUST':
      return 'You hold a bomb that beats that 2. You must play it.';
    case 'NONE':
      return pile === null ? 'You lead — play any combination.' : 'Select cards to beat the pile, or pass.';
  }
}

function illegalReason(combo: Combo, pile: Combo | null, constraint: TurnConstraint): string {
  if (constraint.kind === 'FORCED_OPENING') {
    return `Your opening play has to include the ${cardLabel(constraint.card)}.`;
  }
  if (constraint.kind === 'FORCED_TWO_BUST') {
    return 'You must play a bomb on that 2 — nothing else is allowed.';
  }
  if (pile === null) {
    return `${comboLabel(combo)} is not a combination you can lead.`;
  }
  if (combo.type !== pile.type) {
    return `That is a ${comboLabel(combo).toLowerCase()}, and the pile is a ${comboLabel(pile).toLowerCase()}.`;
  }
  if (combo.length !== pile.length) {
    return `A ${comboLabel(pile).toLowerCase()} can only be beaten by one of the same length.`;
  }
  return 'That does not beat the pile.';
}
