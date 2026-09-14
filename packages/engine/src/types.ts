/**
 * Core domain types for the Big Two rules engine.
 *
 * Naming note: this codebase uses English terms throughout rather than the
 * Vietnamese originals, per product decision. Mapping for reference:
 *   sảnh          -> straight
 *   tứ quý        -> fourOfAKind (bomb)
 *   dây           -> pairChain (bomb)
 *   chặt heo      -> "forced two-bust" (forced bombing of a rank-Two combo)
 *   heo           -> "the Two" (rank Two is the highest rank; colloquially "the pig")
 */

export type Suit = 'SPADE' | 'CLUB' | 'DIAMOND' | 'HEART';

/** Ascending suit strength, per house rule: Spade < Club < Diamond < Heart. */
export const SUIT_ORDER: Record<Suit, number> = {
  SPADE: 0,
  CLUB: 1,
  DIAMOND: 2,
  HEART: 3,
};

export type Rank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2';

/** Ascending rank strength: 3 is lowest, 2 is highest. */
export const RANK_ORDER: Record<Rank, number> = {
  '3': 0,
  '4': 1,
  '5': 2,
  '6': 3,
  '7': 4,
  '8': 5,
  '9': 6,
  '10': 7,
  J: 8,
  Q: 9,
  K: 10,
  A: 11,
  '2': 12,
};

export const ALL_RANKS: Rank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
export const ALL_SUITS: Suit[] = ['SPADE', 'CLUB', 'DIAMOND', 'HEART'];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export function cardId(card: Card): string {
  return `${card.rank}_${card.suit}`;
}

/**
 * A single absolute ordering value for a card: rank dominates, suit breaks ties.
 * Higher value = stronger card. Extensibility note: a future "trump by class"
 * variant would inject an additional modifier here via a comparison context
 * rather than changing this function's signature — see compareCombos.ts.
 */
export function cardValue(card: Card): number {
  return RANK_ORDER[card.rank] * 4 + SUIT_ORDER[card.suit];
}

export type ComboType = 'SINGLE' | 'PAIR' | 'TRIPLE' | 'STRAIGHT' | 'FOUR_OF_A_KIND' | 'PAIR_CHAIN';

/** The two bomb families. They never compare against each other (9.4). */
export type BombType = 'FOUR_OF_A_KIND' | 'PAIR_CHAIN';

export function isBombType(type: ComboType): type is BombType {
  return type === 'FOUR_OF_A_KIND' || type === 'PAIR_CHAIN';
}

export interface Combo {
  type: ComboType;
  /** Cards making up the combo, sorted ascending by cardValue. */
  cards: Card[];
  /**
   * Primary comparable strength for same-type/length comparisons:
   * - SINGLE/PAIR/TRIPLE: cardValue of the highest card in the combo.
   * - STRAIGHT: cardValue of the highest card (straights are always same-length to compare).
   * - FOUR_OF_A_KIND: RANK_ORDER of the quad's rank.
   * - PAIR_CHAIN: cardValue of the highest pair's top card (used only for same-length comparisons).
   */
  strength: number;
  /** Number of cards in a straight, or number of pairs in a pair chain. Undefined otherwise. */
  length?: number;
}

export type PlayerId = string;

export interface RuleConfig {
  /**
   * Minimum number of consecutive pairs required for a pair-chain bomb.
   */
  minPairChainLength: number;
  /**
   * Minimum pair-chain length required to bust each size of Two-combo.
   * Four-of-a-kind is only valid against a single Two (see busting rules).
   * Quad-of-Twos (four-of-a-kind, rank 2) is never bustable.
   */
  twoBustRequirements: {
    singleTwo: { fourOfAKind: true; minPairChainLength: number };
    pairOfTwos: { fourOfAKind: false; minPairChainLength: number };
    tripleOfTwos: { fourOfAKind: false; minPairChainLength: number };
  };
  /** Minimum straight length. Twos are never eligible for straights, and straights never wrap. */
  minStraightLength: number;
}

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  minPairChainLength: 3,
  twoBustRequirements: {
    singleTwo: { fourOfAKind: true, minPairChainLength: 3 },
    pairOfTwos: { fourOfAKind: false, minPairChainLength: 4 },
    // NOTE: not explicitly specified by product — extrapolated from the
    // single/pair pattern (each larger Two-combo requires one more pair-chain
    // length). Flagged for confirmation; trivially adjustable here.
    tripleOfTwos: { fourOfAKind: false, minPairChainLength: 5 },
  },
  minStraightLength: 3,
};
