import { describe, expect, it } from 'vitest';
import type { Card } from '@big-two/engine';
import { cardId } from '@big-two/engine';
import { detectCombo } from '@big-two/engine';
import { fractureCost, planHand } from '../src/lib/handPlan.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

/** Every card in the hand must appear in exactly one planned combo. */
function assertPartitions(hand: Card[], combos: { cards: Card[] }[]) {
  const planned = combos.flatMap((k) => k.cards).map(cardId).sort();
  expect(planned).toEqual(hand.map(cardId).sort());
}

describe('planHand — decomposition', () => {
  it('recognises a straight as a single play rather than five singles', () => {
    const hand = [c('3', 'SPADE'), c('4', 'CLUB'), c('5', 'DIAMOND'), c('6', 'HEART'), c('7', 'SPADE')];
    const plan = planHand(hand);
    expect(plan.playCount).toBe(1);
    expect(plan.combos[0]!.type).toBe('STRAIGHT');
  });

  it('keeps a four-of-a-kind together', () => {
    const hand = [c('9', 'SPADE'), c('9', 'CLUB'), c('9', 'DIAMOND'), c('9', 'HEART')];
    const plan = planHand(hand);
    expect(plan.playCount).toBe(1);
    expect(plan.combos[0]!.type).toBe('FOUR_OF_A_KIND');
  });

  it('finds a pair chain across three consecutive ranks', () => {
    const hand = [
      c('5', 'SPADE'), c('5', 'CLUB'),
      c('6', 'SPADE'), c('6', 'CLUB'),
      c('7', 'SPADE'), c('7', 'CLUB'),
    ];
    const plan = planHand(hand);
    expect(plan.playCount).toBe(1);
    expect(plan.combos[0]!.type).toBe('PAIR_CHAIN');
    expect(plan.combos[0]!.length).toBe(3);
  });

  it('always partitions the hand exactly — no card lost or duplicated', () => {
    const hand = [
      c('3', 'SPADE'), c('4', 'CLUB'), c('5', 'DIAMOND'),
      c('9', 'SPADE'), c('9', 'CLUB'),
      c('K', 'HEART'),
      c('2', 'SPADE'), c('2', 'HEART'),
    ];
    const plan = planHand(hand);
    assertPartitions(hand, plan.combos);
    expect(plan.playCount).toBe(plan.combos.length);
  });

  it('reports loose singles ascending, and marks structured cards as load-bearing', () => {
    const hand = [c('3', 'SPADE'), c('4', 'CLUB'), c('5', 'DIAMOND'), c('K', 'HEART'), c('2', 'SPADE')];
    const plan = planHand(hand);
    expect(plan.looseSingles.map((s) => s.cards[0]!.rank)).toEqual(['K', '2']);
    expect(plan.loadBearing.has(cardId(c('4', 'CLUB')))).toBe(true);
    expect(plan.loadBearing.has(cardId(c('K', 'HEART')))).toBe(false);
  });

  it('handles a full 13-card hand without stranding cards', () => {
    const hand = [
      c('3', 'SPADE'), c('3', 'CLUB'), c('4', 'SPADE'), c('4', 'CLUB'),
      c('5', 'SPADE'), c('5', 'CLUB'), c('8', 'DIAMOND'), c('9', 'DIAMOND'),
      c('10', 'DIAMOND'), c('J', 'HEART'), c('Q', 'HEART'), c('A', 'SPADE'),
      c('2', 'HEART'),
    ];
    const plan = planHand(hand);
    assertPartitions(hand, plan.combos);
    // 3-4-5 pair chain plus an 8-9-10-J-Q straight is two plays; the rest are loose.
    expect(plan.playCount).toBeLessThanOrEqual(4);
  });
});

describe('fractureCost', () => {
  it('is zero for a combo the plan already intends to play', () => {
    const hand = [c('3', 'SPADE'), c('4', 'CLUB'), c('5', 'DIAMOND')];
    const plan = planHand(hand);
    expect(fractureCost(plan, plan.combos[0]!)).toBe(0);
  });

  it('charges one per load-bearing card torn out of a planned combo', () => {
    const hand = [c('3', 'SPADE'), c('4', 'CLUB'), c('5', 'DIAMOND'), c('K', 'HEART')];
    const plan = planHand(hand);
    const loneFour = detectCombo([c('4', 'CLUB')])!;
    expect(fractureCost(plan, loneFour)).toBe(1);
  });

  it('is zero for a loose single, which the plan was going to play alone anyway', () => {
    const hand = [c('3', 'SPADE'), c('4', 'CLUB'), c('5', 'DIAMOND'), c('K', 'HEART')];
    const plan = planHand(hand);
    const loneKing = detectCombo([c('K', 'HEART')])!;
    expect(fractureCost(plan, loneKing)).toBe(0);
  });
});
