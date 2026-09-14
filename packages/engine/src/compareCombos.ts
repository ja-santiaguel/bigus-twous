import { type Combo, DEFAULT_RULE_CONFIG, type RuleConfig, isBombType } from './types.js';

/**
 * Extensibility hook for a future "trump cards by class" variant (9.10).
 * Unused in v1 — comparisons ignore it — but keeping it in the signature now
 * means the comparator's call sites never need to change when that feature
 * lands; only the comparator's body would.
 */
export interface ComparisonContext {
  trumpRankOverride?: never;
}

function isRankTwoCombo(combo: Combo): boolean {
  return (
    (combo.type === 'SINGLE' || combo.type === 'PAIR' || combo.type === 'TRIPLE') &&
    combo.cards.every((c) => c.rank === '2')
  );
}

function isQuadOfTwos(combo: Combo): boolean {
  return combo.type === 'FOUR_OF_A_KIND' && combo.cards[0]!.rank === '2';
}

/**
 * Can `candidate` legally be played on top of `pile`, ignoring the forced-bomb
 * rule (see canForceBust below for that)? This covers:
 *  - normal same-type/length beats (higher single beats lower single, etc.)
 *  - a same-type Two beaten by a higher-suited Two (still "normal", not a bomb — 9.5)
 *  - bomb-vs-bomb beats within the same bomb family (9.4)
 * It does NOT allow a bomb to beat a non-Two, non-bomb pile — see module docs.
 */
export function canBeat(pile: Combo, candidate: Combo, _rules: RuleConfig = DEFAULT_RULE_CONFIG): boolean {
  if (isQuadOfTwos(pile)) return false; // ceiling of the game (9.4) — nothing beats it

  // Bomb vs Two: handled exclusively by canForceBust; a "voluntary" bomb play
  // against a Two combo still must satisfy the same size/family rules, so we
  // delegate here for consistency instead of duplicating the logic.
  if (isRankTwoCombo(pile) && isBombType(candidate.type)) {
    return canForceBust(pile, candidate, _rules);
  }

  // Bomb vs Bomb: only within the same family, longer/higher wins (9.4).
  if (isBombType(pile.type) && isBombType(candidate.type)) {
    if (pile.type !== candidate.type) return false; // families never cross-compare
    if (pile.type === 'PAIR_CHAIN') {
      // Pair chains compare ONLY against chains of the same length (9.4). A
      // longer chain does not beat a shorter one — length determines which
      // size of Two-combo the chain can bust (9.5), not which chains it
      // outranks. Same rule shape as straights.
      if ((candidate.length ?? 0) !== (pile.length ?? 0)) return false;
      return candidate.strength > pile.strength; // same length -> compare top card
    }
    // FOUR_OF_A_KIND vs FOUR_OF_A_KIND
    return candidate.strength > pile.strength;
  }

  // A bomb cannot beat a non-Two, non-bomb pile in this ruleset (bombs are
  // exclusively a Two-counter here, not a general "beat anything" play).
  if (isBombType(candidate.type) && !isBombType(pile.type) && !isRankTwoCombo(pile)) return false;

  // Normal same-type/length comparison.
  if (pile.type !== candidate.type) return false;
  if (pile.type === 'STRAIGHT' && candidate.length !== pile.length) return false;
  return candidate.strength > pile.strength;
}

/**
 * Determines whether `candidate` is a bomb capable of forcibly busting a Two
 * pile, per the exact thresholds in RuleConfig.twoBustRequirements (9.5).
 */
export function canForceBust(pile: Combo, candidate: Combo, rules: RuleConfig = DEFAULT_RULE_CONFIG): boolean {
  if (!isRankTwoCombo(pile)) return false;
  if (!isBombType(candidate.type)) return false;

  const req =
    pile.type === 'SINGLE'
      ? rules.twoBustRequirements.singleTwo
      : pile.type === 'PAIR'
        ? rules.twoBustRequirements.pairOfTwos
        : rules.twoBustRequirements.tripleOfTwos;

  if (candidate.type === 'FOUR_OF_A_KIND') return req.fourOfAKind;
  // PAIR_CHAIN
  return (candidate.length ?? 0) >= req.minPairChainLength;
}

/**
 * All combos in `available` that could legally bust `pile` via the forced-bomb
 * rule. If this returns a non-empty array, the player MUST choose from it
 * (9.5) — they may not pass or play a normal counter instead.
 */
export function getForcedBustOptions(pile: Combo, available: Combo[], rules: RuleConfig = DEFAULT_RULE_CONFIG): Combo[] {
  if (!isRankTwoCombo(pile)) return [];
  return available.filter((c) => canForceBust(pile, c, rules));
}
