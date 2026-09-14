import {
  ALL_RANKS,
  type Card,
  type Combo,
  DEFAULT_RULE_CONFIG,
  RANK_ORDER,
  type Rank,
  type RuleConfig,
  cardId,
  cardValue,
  createDeck,
  type PlayerView,
} from '@big-two/engine';

/**
 * Card counting, derived purely from the redacted PlayerView.
 *
 * Everything here is computed from `view.hand` plus the CARDS_PLAYED events in
 * `view.history` — the same information a human at the table has. There is no
 * path from this module to another player's hand, by construction: it never
 * receives a GameState, only a PlayerView. That property is what makes the
 * hard-difficulty CPU "good" rather than "cheating".
 *
 * The headline question it answers is `isUnbeatable(combo)`: if no card still
 * outside my hand can answer this combo, then leading it is free tempo — I
 * keep the lead and get another turn. Knowing that is most of the gap between
 * a competent player and a naive one.
 */
export interface CardKnowledge {
  /** Cards that have been played by anyone, this round. */
  playedCardIds: Set<string>;
  /** Cards not in my hand and not yet played — i.e. distributed among opponents. */
  unseen: Card[];
  /** True when nothing still in circulation can legally answer `combo`. */
  isUnbeatable(combo: Combo): boolean;
}

export function trackCards(view: PlayerView, rules: RuleConfig = DEFAULT_RULE_CONFIG): CardKnowledge {
  const playedCardIds = new Set<string>();
  for (const event of view.history) {
    if (event.type === 'CARDS_PLAYED') {
      for (const card of event.combo.cards) playedCardIds.add(cardId(card));
    }
  }

  const ownIds = new Set(view.hand.map(cardId));
  const unseen = createDeck().filter((c) => !playedCardIds.has(cardId(c)) && !ownIds.has(cardId(c)));

  return {
    playedCardIds,
    unseen,
    isUnbeatable: (combo: Combo) => !someUnseenComboBeats(combo, unseen, rules),
  };
}

function byRank(cards: Card[]): Map<Rank, Card[]> {
  const map = new Map<Rank, Card[]>();
  for (const c of cards) {
    const list = map.get(c.rank) ?? [];
    list.push(c);
    map.set(c.rank, list);
  }
  return map;
}

/**
 * Analytic beatability check rather than enumerate-and-compare: the unseen set
 * can be 39 cards, and enumerating every combo it could form on every turn
 * would dominate simulation runtime for no accuracy gain.
 */
function someUnseenComboBeats(pile: Combo, unseen: Card[], rules: RuleConfig): boolean {
  const groups = byRank(unseen);
  const isTwoCombo =
    (pile.type === 'SINGLE' || pile.type === 'PAIR' || pile.type === 'TRIPLE') &&
    pile.cards.every((c) => c.rank === '2');

  // Quad of Twos is the ceiling of the game (9.4) — nothing answers it.
  if (pile.type === 'FOUR_OF_A_KIND' && pile.cards[0]!.rank === '2') return false;

  switch (pile.type) {
    case 'SINGLE':
      if (bestSameRankGroupStrength(groups, 1) > pile.strength) return true;
      break;
    case 'PAIR':
      if (bestSameRankGroupStrength(groups, 2) > pile.strength) return true;
      break;
    case 'TRIPLE':
      if (bestSameRankGroupStrength(groups, 3) > pile.strength) return true;
      break;
    case 'STRAIGHT':
      if (bestStraightStrength(groups, pile.length ?? 0) > pile.strength) return true;
      break;
    case 'FOUR_OF_A_KIND':
      // Only a higher four-of-a-kind answers a quad; pair chains never cross
      // the family boundary (9.4).
      for (const [rank, cards] of groups) {
        if (cards.length === 4 && RANK_ORDER[rank] > pile.strength) return true;
      }
      return false;
    case 'PAIR_CHAIN': {
      // Only a chain of the SAME length with a higher top card answers a chain
      // (9.4) — a longer chain is not a bigger bomb, and a four-of-a-kind never
      // crosses the family boundary.
      const pileLength = pile.length ?? 0;
      return bestPairChainStrength(groups, pileLength) > pile.strength;
    }
  }

  // Bombs only ever answer a Two-combo in this ruleset (9.5), and the required
  // bomb depends on the size of that Two-combo.
  if (isTwoCombo) {
    const req =
      pile.type === 'SINGLE'
        ? rules.twoBustRequirements.singleTwo
        : pile.type === 'PAIR'
          ? rules.twoBustRequirements.pairOfTwos
          : rules.twoBustRequirements.tripleOfTwos;

    if (req.fourOfAKind) {
      for (const cards of groups.values()) if (cards.length === 4) return true;
    }
    if (longestPairChain(groups) >= req.minPairChainLength) return true;
  }

  return false;
}

/** Strongest combo of `size` same-rank cards formable from the unseen set, as a cardValue. */
function bestSameRankGroupStrength(groups: Map<Rank, Card[]>, size: number): number {
  let best = -1;
  for (const cards of groups.values()) {
    if (cards.length < size) continue;
    // Best play of this rank uses its highest cards, so the combo's strength is
    // the highest cardValue in the group.
    const top = Math.max(...cards.map(cardValue));
    if (top > best) best = top;
  }
  return best;
}

const STRAIGHT_RANKS = ALL_RANKS.filter((r) => r !== '2');

function bestStraightStrength(groups: Map<Rank, Card[]>, length: number): number {
  if (length < 1) return -1;
  let best = -1;
  for (let start = 0; start + length <= STRAIGHT_RANKS.length; start++) {
    const window = STRAIGHT_RANKS.slice(start, start + length);
    if (!window.every((r) => (groups.get(r)?.length ?? 0) >= 1)) continue;
    const topRank = window[window.length - 1]!;
    const top = Math.max(...groups.get(topRank)!.map(cardValue));
    if (top > best) best = top;
  }
  return best;
}

function longestPairChain(groups: Map<Rank, Card[]>): number {
  let longest = 0;
  let run = 0;
  for (const rank of STRAIGHT_RANKS) {
    if ((groups.get(rank)?.length ?? 0) >= 2) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
}

function bestPairChainStrength(groups: Map<Rank, Card[]>, length: number): number {
  if (length < 1) return -1;
  let best = -1;
  for (let start = 0; start + length <= STRAIGHT_RANKS.length; start++) {
    const window = STRAIGHT_RANKS.slice(start, start + length);
    if (!window.every((r) => (groups.get(r)?.length ?? 0) >= 2)) continue;
    const topRank = window[window.length - 1]!;
    const top = Math.max(...groups.get(topRank)!.map(cardValue));
    if (top > best) best = top;
  }
  return best;
}
