import {
  ALL_RANKS,
  type Card,
  type Combo,
  type ComboType,
  DEFAULT_RULE_CONFIG,
  RANK_ORDER,
  type Rank,
  type RuleConfig,
  cardValue,
} from './types.js';

function sortByValue(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => cardValue(a) - cardValue(b));
}

function groupByRank(cards: Card[]): Map<Rank, Card[]> {
  const map = new Map<Rank, Card[]>();
  for (const c of cards) {
    const list = map.get(c.rank) ?? [];
    list.push(c);
    map.set(c.rank, list);
  }
  return map;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  const withFirst = combinations(rest, k - 1).map((c) => [first as T, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

/**
 * Determines whether `cards` forms a valid, single combo type, per the
 * locked ruleset (Section 9). Returns null if the cards form no valid combo.
 * Order of `cards` does not matter — the result is always sorted internally.
 */
export function detectCombo(cards: Card[], rules: RuleConfig = DEFAULT_RULE_CONFIG): Combo | null {
  if (cards.length === 0) return null;
  const sorted = sortByValue(cards);
  const byRank = groupByRank(sorted);

  // Same-rank combos: single / pair / triple / four-of-a-kind.
  if (byRank.size === 1) {
    const type = sameRankComboType(sorted.length);
    if (!type) return null;
    const strength = type === 'FOUR_OF_A_KIND' ? RANK_ORDER[sorted[0]!.rank] : cardValue(sorted[sorted.length - 1]!);
    return { type, cards: sorted, strength };
  }

  // Multi-rank combos: straight or pair chain.
  const straight = detectStraight(sorted, rules);
  if (straight) return straight;

  const pairChain = detectPairChain(sorted, byRank, rules);
  if (pairChain) return pairChain;

  return null;
}

function sameRankComboType(count: number): ComboType | null {
  switch (count) {
    case 1:
      return 'SINGLE';
    case 2:
      return 'PAIR';
    case 3:
      return 'TRIPLE';
    case 4:
      return 'FOUR_OF_A_KIND';
    default:
      return null;
  }
}

function detectStraight(sorted: Card[], rules: RuleConfig): Combo | null {
  if (sorted.length < rules.minStraightLength) return null;
  // Straights require exactly one card per rank (no pairs mixed in) and no rank-2.
  const ranks = sorted.map((c) => c.rank);
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size !== ranks.length) return null; // duplicate rank present -> not a straight
  if (ranks.includes('2')) return null; // Twos are never eligible for straights (9.6)

  const orders = sorted.map((c) => RANK_ORDER[c.rank]);
  for (let i = 1; i < orders.length; i++) {
    if (orders[i]! !== orders[i - 1]! + 1) return null; // must be strictly consecutive, no wrap (9.6)
  }

  return {
    type: 'STRAIGHT',
    cards: sorted,
    strength: cardValue(sorted[sorted.length - 1]!),
    length: sorted.length,
  };
}

function detectPairChain(sorted: Card[], byRank: Map<Rank, Card[]>, rules: RuleConfig): Combo | null {
  if (sorted.length % 2 !== 0) return null;
  const numPairs = sorted.length / 2;
  if (numPairs < rules.minPairChainLength) return null;
  if (byRank.size !== numPairs) return null; // every rank must contribute exactly one pair

  for (const [rank, cards] of byRank.entries()) {
    if (cards.length !== 2) return null;
    if (rank === '2') return null; // Twos excluded from pair chains, consistent with straights
  }

  const ranksInOrder = [...byRank.keys()].sort((a, b) => RANK_ORDER[a] - RANK_ORDER[b]);
  for (let i = 1; i < ranksInOrder.length; i++) {
    if (RANK_ORDER[ranksInOrder[i]!] !== RANK_ORDER[ranksInOrder[i - 1]!] + 1) return null;
  }

  return {
    type: 'PAIR_CHAIN',
    cards: sorted,
    strength: cardValue(sorted[sorted.length - 1]!),
    length: numPairs,
  };
}

const MAX_ENUMERATED_MULTI_RANK_COMBOS = 500;

/**
 * Enumerates every legal combo a hand could form, independent of any active
 * pile. Used by legal-move generation and by CPU strategies. This is the
 * single source of truth for "what can this hand play" — the same function
 * backs move validation, CPU AI, and UI legal-move hints.
 */
export function enumerateCombos(hand: Card[], rules: RuleConfig = DEFAULT_RULE_CONFIG): Combo[] {
  const combos: Combo[] = [];
  const byRank = groupByRank(hand);

  // Singles
  for (const card of hand) {
    combos.push({ type: 'SINGLE', cards: [card], strength: cardValue(card) });
  }

  // Pairs, triples, four-of-a-kind (all combinations within each rank group)
  for (const [, cards] of byRank.entries()) {
    if (cards.length >= 2) {
      for (const pair of combinations(cards, 2)) {
        combos.push(detectCombo(pair, rules)!);
      }
    }
    if (cards.length >= 3) {
      for (const triple of combinations(cards, 3)) {
        combos.push(detectCombo(triple, rules)!);
      }
    }
    if (cards.length === 4) {
      combos.push(detectCombo(cards, rules)!);
    }
  }

  combos.push(...enumerateStraights(byRank, rules));
  combos.push(...enumeratePairChains(byRank, rules));

  return combos;
}

function consecutiveRankWindows(presentRanks: Set<Rank>, minLength: number): Rank[][] {
  const eligibleRanks = ALL_RANKS.filter((r) => r !== '2'); // Twos never participate (9.6)
  const windows: Rank[][] = [];
  for (let start = 0; start < eligibleRanks.length; start++) {
    const window: Rank[] = [];
    for (let end = start; end < eligibleRanks.length; end++) {
      const rank = eligibleRanks[end]!;
      if (!presentRanks.has(rank)) break;
      window.push(rank);
      if (window.length >= minLength) windows.push(window.slice());
    }
  }
  return windows;
}

function enumerateStraights(byRank: Map<Rank, Card[]>, rules: RuleConfig): Combo[] {
  const presentRanks = new Set(byRank.keys());
  const windows = consecutiveRankWindows(presentRanks, rules.minStraightLength);
  const results: Combo[] = [];

  for (const window of windows) {
    const choicesPerRank = window.map((rank) => byRank.get(rank)!);
    for (const combo of cartesianProduct(choicesPerRank, MAX_ENUMERATED_MULTI_RANK_COMBOS)) {
      const detected = detectCombo(combo, rules);
      if (detected?.type === 'STRAIGHT') results.push(detected);
    }
  }
  return results;
}

function enumeratePairChains(byRank: Map<Rank, Card[]>, rules: RuleConfig): Combo[] {
  const eligibleForPairs = new Map<Rank, Card[]>();
  for (const [rank, cards] of byRank.entries()) {
    if (rank !== '2' && cards.length >= 2) eligibleForPairs.set(rank, cards);
  }
  const presentRanks = new Set(eligibleForPairs.keys());
  const windows = consecutiveRankWindows(presentRanks, rules.minPairChainLength);
  const results: Combo[] = [];

  for (const window of windows) {
    const pairChoicesPerRank = window.map((rank) => combinations(eligibleForPairs.get(rank)!, 2));
    for (const pairSelection of cartesianProduct(pairChoicesPerRank, MAX_ENUMERATED_MULTI_RANK_COMBOS)) {
      const combo = pairSelection.flat();
      const detected = detectCombo(combo, rules);
      if (detected?.type === 'PAIR_CHAIN') results.push(detected);
    }
  }
  return results;
}

/** Cartesian product across groups, with a safety cap to avoid combinatorial blowup on pathological hands. */
function cartesianProduct<T>(groups: T[][], cap: number): T[][] {
  let results: T[][] = [[]];
  for (const group of groups) {
    const next: T[][] = [];
    for (const partial of results) {
      for (const item of group) {
        next.push([...partial, item]);
        if (next.length >= cap) return next;
      }
    }
    results = next;
  }
  return results;
}
