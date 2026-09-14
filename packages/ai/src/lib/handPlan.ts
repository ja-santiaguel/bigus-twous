import {
  type Card,
  type Combo,
  DEFAULT_RULE_CONFIG,
  type RuleConfig,
  cardId,
  cardValue,
  enumerateCombos,
  isBombType,
} from '@big-two/engine';

/**
 * Hand decomposition — the substrate every competitive strategy is built on.
 *
 * The thing that actually wins games of Big Two is not "pick the strongest
 * legal combo", it is *how few plays it takes to empty your hand*. A hand of
 * 3-4-5-6-7 is one play as a straight and five plays as loose singles. So
 * before a strategy decides anything, it partitions its hand into a set of
 * disjoint combos and reasons about moves in terms of how much they damage
 * that partition.
 *
 * This is deliberately heuristic (deterministic multi-start greedy), not an
 * exhaustive search: it must stay fast enough to run thousands of simulated
 * games. The exported signature is the seam — a search-based planner can
 * replace the body later without touching any strategy code.
 */

export interface HandPlan {
  /** Disjoint combos covering the entire hand. Every card appears exactly once. */
  combos: Combo[];
  /** Number of plays this hand needs to go out, assuming it never gets blocked. */
  playCount: number;
  /** cardIds that belong to a multi-card planned combo — breaking these costs tempo. */
  loadBearing: Set<string>;
  /** Planned combos of one card, ascending by strength. These are the cheap things to shed. */
  looseSingles: Combo[];
}

/**
 * Tie-break flavours for the greedy pass. Running several and keeping the best
 * result is a cheap way to dodge the obvious greedy failure mode where taking a
 * long straight strands two cards that would have paired up.
 */
type PlanBias = 'LONGEST' | 'LONGEST_LOWEST' | 'CHAINS_FIRST' | 'PAIRS_FIRST';

const PLAN_BIASES: PlanBias[] = ['LONGEST', 'LONGEST_LOWEST', 'CHAINS_FIRST', 'PAIRS_FIRST'];

export function planHand(hand: Card[], rules: RuleConfig = DEFAULT_RULE_CONFIG): HandPlan {
  let best: HandPlan | null = null;
  for (const bias of PLAN_BIASES) {
    const candidate = buildPlan(hand, bias, rules);
    if (best === null || planIsBetter(candidate, best)) best = candidate;
  }
  return best!;
}

/**
 * Fewer plays always wins. On a tie, prefer the plan whose leftover singles are
 * weaker overall — loose low cards are dead weight you can shed while holding
 * the lead, loose high cards are fine, so a plan that strands a lone 4 is worse
 * than one that strands a lone King.
 */
function planIsBetter(a: HandPlan, b: HandPlan): boolean {
  if (a.playCount !== b.playCount) return a.playCount < b.playCount;
  return looseWeight(a) > looseWeight(b);
}

function looseWeight(plan: HandPlan): number {
  return plan.looseSingles.reduce((sum, s) => sum + s.strength, 0);
}

function buildPlan(hand: Card[], bias: PlanBias, rules: RuleConfig): HandPlan {
  let remaining = hand.slice();
  const chosen: Combo[] = [];

  // Repeatedly take the highest-scoring multi-card combo still formable from
  // what's left, until only loose cards remain.
  for (;;) {
    const candidates = enumerateCombos(remaining, rules).filter((c) => c.cards.length > 1);
    if (candidates.length === 0) break;

    let pick = candidates[0]!;
    let pickScore = biasScore(pick, bias);
    for (const candidate of candidates) {
      const score = biasScore(candidate, bias);
      if (score > pickScore) {
        pick = candidate;
        pickScore = score;
      }
    }

    chosen.push(pick);
    const used = new Set(pick.cards.map(cardId));
    remaining = remaining.filter((c) => !used.has(cardId(c)));
  }

  const looseSingles: Combo[] = remaining
    .map((card): Combo => ({ type: 'SINGLE', cards: [card], strength: cardValue(card) }))
    .sort((a, b) => a.strength - b.strength);

  const loadBearing = new Set<string>();
  for (const combo of chosen) {
    for (const card of combo.cards) loadBearing.add(cardId(card));
  }

  const combos = [...chosen, ...looseSingles];
  return { combos, playCount: combos.length, loadBearing, looseSingles };
}

/** Higher is more attractive to commit to the plan under a given bias. */
function biasScore(combo: Combo, bias: PlanBias): number {
  const size = combo.cards.length;
  // Strength is normalised into a sub-unit tie-break so it never outranks size.
  const lowness = 1 - combo.strength / 64;

  switch (bias) {
    case 'LONGEST':
      return size * 10;
    case 'LONGEST_LOWEST':
      return size * 10 + lowness;
    case 'CHAINS_FIRST':
      // Favour straights and pair chains, which are the combos that soak up the
      // most otherwise-dead low cards per play.
      return size * 10 + (combo.type === 'STRAIGHT' || combo.type === 'PAIR_CHAIN' ? 5 : 0) + lowness;
    case 'PAIRS_FIRST':
      // The opposite pressure: keep pairs and quads intact even if that means a
      // shorter straight, which matters for hands that want bomb material.
      return size * 10 + (isBombType(combo.type) || combo.type === 'PAIR' || combo.type === 'TRIPLE' ? 5 : 0) + lowness;
  }
}

/**
 * How much damage does playing `combo` do to `plan`?
 *
 * 0 means the combo is exactly a planned combo (free — it's what the plan
 * wanted). Otherwise every load-bearing card it consumes is a card torn out of
 * a structure that will now have to be played as scraps later.
 */
export function fractureCost(plan: HandPlan, combo: Combo): number {
  const comboIds = combo.cards.map(cardId);
  const comboKey = comboIds.slice().sort().join('|');

  for (const planned of plan.combos) {
    const plannedKey = planned.cards.map(cardId).sort().join('|');
    if (plannedKey === comboKey) return 0;
  }

  let cost = 0;
  for (const id of comboIds) {
    if (plan.loadBearing.has(id)) cost += 1;
  }
  return cost;
}
