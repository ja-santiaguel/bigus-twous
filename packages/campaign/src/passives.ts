import {
  enumerateCombos,
  getLegalMoves,
  getTurnOptions,
  RANK_ORDER,
  type Combo,
  type GameState,
  type PlayerId,
  type TurnOptions,
} from '@big-two/engine';
import type { ClassId } from './classes.js';
import { levelOf, type Held } from './medallions.js';

/**
 * Class plays: the beats a class — and the Medallions it has built — adds to
 * the base rules.
 *
 * All of them are one shape — "this kind of play may also beat that kind" —
 * so they are one mechanism: the base game's turn options, plus any combo in
 * the seat's hand its rules let beat the pile. The combos are the ordinary
 * ones the engine detects, so nothing about how a play is recognised, shown
 * or recorded changes; what lands is the new pile, and the trick carries on
 * under the base rules.
 *
 * Never added on a forced bust (9.5), on the opening play, or on a lead. A
 * class play costs gold (see `passiveCost`), so it is only offered to a seat
 * that can pay for it.
 */

export interface SeatRules {
  classId: ClassId;
  medallions: readonly Held[];
  /** Whether the seat can pay for a class play right now. */
  canPay: boolean;
}

const rank = (combo: Combo) => RANK_ORDER[combo.cards[0]!.rank];
const lengthOf = (combo: Combo) => combo.length ?? combo.cards.length;
const allTwos = (combo: Combo) => combo.cards.every((c) => c.rank === '2');

/**
 * Whether a seat of this class, holding these Medallions, may beat `pile`
 * with `combo` by a class play. Every beat here is one the base rules do not
 * allow, so a class play is always a rule bent.
 */
export function passiveBeats(classId: ClassId, pile: Combo, combo: Combo, medallions: readonly Held[] = []): boolean {
  const level = (id: Parameters<typeof levelOf>[1]) => levelOf(medallions, id);
  switch (classId) {
    case 'commoner': {
      // Uprising: a long straight topples a single 2 — four long with the Medallion.
      const shortest = level('uprising') >= 1 ? 4 : 5;
      if (pile.type === 'SINGLE' && allTwos(pile) && combo.type === 'STRAIGHT' && lengthOf(combo) >= shortest)
        return true;
      // ...and at level 2, six or more topples a pair of 2s.
      if (
        level('uprising') >= 2 &&
        pile.type === 'PAIR' &&
        allTwos(pile) &&
        combo.type === 'STRAIGHT' &&
        lengthOf(combo) >= 6
      )
        return true;
      // Rabble: a common triple over a court pair.
      if (
        level('rabble') >= 1 &&
        pile.type === 'PAIR' &&
        rank(pile) >= RANK_ORDER['J'] &&
        !allTwos(pile) &&
        combo.type === 'TRIPLE' &&
        rank(combo) <= RANK_ORDER['10']
      )
        return true;
      return false;
    }
    case 'courtier': {
      // Allegiance: a court card over a higher card of its own suit, 2s excepted.
      if (
        pile.type === 'SINGLE' &&
        !allTwos(pile) &&
        combo.type === 'SINGLE' &&
        rank(combo) >= RANK_ORDER['J'] &&
        !allTwos(combo) &&
        combo.cards[0]!.suit === pile.cards[0]!.suit &&
        rank(pile) > rank(combo)
      )
        return true;
      // ...and with the Medallion, a court pair over a common triple — higher at level 2.
      const reach = [null, RANK_ORDER['10'], RANK_ORDER['Q']][level('precedence')] ?? null;
      if (
        reach !== null &&
        pile.type === 'TRIPLE' &&
        rank(pile) <= reach &&
        combo.type === 'PAIR' &&
        rank(combo) >= RANK_ORDER['J'] &&
        rank(combo) > rank(pile) &&
        !allTwos(combo)
      )
        return true;
      // Royal Pair: Aces over any triple below 2s.
      if (
        level('royal-pair') >= 1 &&
        pile.type === 'TRIPLE' &&
        !allTwos(pile) &&
        combo.type === 'PAIR' &&
        combo.cards[0]!.rank === 'A'
      )
        return true;
      // Intrigue: Kings or Aces over a chain of three pairs.
      if (
        level('intrigue') >= 1 &&
        pile.type === 'PAIR_CHAIN' &&
        lengthOf(pile) === 3 &&
        combo.type === 'PAIR' &&
        (combo.cards[0]!.rank === 'K' || combo.cards[0]!.rank === 'A')
      )
        return true;
      return false;
    }
    case 'tyrant': {
      // Decree: a single 2 over a short straight — longer with the Medallion.
      const longest = [5, 7, Infinity][level('decree')] ?? Infinity;
      if (pile.type === 'STRAIGHT' && lengthOf(pile) <= longest && combo.type === 'SINGLE' && allTwos(combo))
        return true;
      // Iron Crown: a pair of 2s over any straight.
      if (level('iron-crown') >= 1 && pile.type === 'STRAIGHT' && combo.type === 'PAIR' && allTwos(combo)) return true;
      return false;
    }
  }
}

/**
 * A class play's price, in the seat's own antes: a coin to the crowd for the
 * Commoner, a bribe to the court for the Courtier, a blood price for the
 * Tyrant — whose chance comes most often and whose 2 is the strongest card, so
 * it pays most. Medallions bring it down. Paid into the hand's pot.
 */
export const PASSIVE_COST_ANTES: Record<ClassId, number> = { commoner: 0.5, courtier: 0.75, tyrant: 1.5 };

export function passiveCost(classId: ClassId, medallions: readonly Held[]): number {
  const base = PASSIVE_COST_ANTES[classId];
  switch (classId) {
    case 'commoner':
      return [base, base / 2, 0][levelOf(medallions, 'frugal')] ?? 0;
    case 'courtier':
      return [base, base / 2, 0][levelOf(medallions, 'patronage')] ?? 0;
    case 'tyrant':
      return [base, 1, 0.5][levelOf(medallions, 'blood-rite')] ?? 0.5;
  }
}

/**
 * The turn options for a campaign table: the base rules, widened by the class
 * plays of whoever's turn it is, and narrowed where the seat that played the
 * pile is Unbowed. Seats with no rules play the base game.
 */
export function campaignTurnOptions(rulesOf: (id: PlayerId) => SeatRules | null) {
  return (state: GameState): TurnOptions => {
    let base = getTurnOptions(state);
    const pile = state.trick.pile;
    if (state.firstPlayPending || pile === null) return base;
    const actor = state.players[state.turnIndex]!;

    // Unbowed: a single 2 its holder played cannot be chopped by four of a kind.
    const owner = state.trick.lastPlayedBy ? rulesOf(state.trick.lastPlayedBy) : null;
    if (
      owner &&
      levelOf(owner.medallions, 'unbowed') >= 1 &&
      pile.type === 'SINGLE' &&
      allTwos(pile) &&
      base.legalMoves.some((m) => m.type === 'FOUR_OF_A_KIND')
    ) {
      const kept = base.legalMoves.filter((m) => m.type !== 'FOUR_OF_A_KIND');
      base =
        base.constraint.kind === 'FORCED_TWO_BUST' && kept.length === 0
          ? // The only bust on offer was the quad: the seat is no longer forced.
            {
              legalMoves: getLegalMoves(actor.hand, pile).filter((m) => m.type !== 'FOUR_OF_A_KIND'),
              canPass: true,
              constraint: { kind: 'NONE' },
            }
          : { ...base, legalMoves: kept };
    }
    if (base.constraint.kind === 'FORCED_TWO_BUST') return base;

    const rules = rulesOf(actor.id);
    if (!rules || !rules.canPay) return base;
    const have = new Set(base.legalMoves.map(comboKey));
    const extra = enumerateCombos(actor.hand).filter(
      (combo) => passiveBeats(rules.classId, pile, combo, rules.medallions) && !have.has(comboKey(combo)),
    );
    return extra.length === 0 ? base : { ...base, legalMoves: [...base.legalMoves, ...extra] };
  };
}

function comboKey(combo: Combo): string {
  return (
    combo.type +
    ':' +
    combo.cards
      .map((c) => c.rank + c.suit)
      .sort()
      .join(',')
  );
}
