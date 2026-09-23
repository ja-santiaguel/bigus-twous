import { describe, expect, it } from 'vitest';
import {
  createNewRound,
  createRng,
  detectCombo,
  getTurnOptions,
  type Card,
  type Combo,
  type GameState,
} from '@big-two/engine';
import { campaignTurnOptions, passiveBeats, passiveCost, type SeatRules } from '../src/passives.js';
import type { ClassId } from '../src/classes.js';
import type { Held } from '../src/medallions.js';

const rules = (classId: ClassId, medallions: Held[] = [], canPay = true): SeatRules => ({
  classId,
  medallions,
  canPay,
});

/** Class passives: extra beats on top of the base rules, and nothing else. */

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const combo = (cards: Card[]): Combo => detectCombo(cards)!;
const straight = (n: number): Combo =>
  combo(
    (['3', '4', '5', '6', '7', '8', '9', '10'] as const)
      .slice(0, n)
      .map((rank, i) => c(rank, i % 2 ? 'CLUB' : 'SPADE')),
  );

/** A round, with a chosen pile and hand for the seat whose turn it is. */
function facing(pile: Combo, hand: Card[]): GameState {
  const round = createNewRound(
    ['seat-1', 'seat-2', 'seat-3', 'seat-4'],
    createRng('passives'),
    'passives',
    1,
    null,
    {},
  );
  const players = round.players.map((p, i) => (i === round.turnIndex ? { ...p, hand } : p));
  return {
    ...round,
    players,
    firstPlayPending: false,
    trick: { pile, lastPlayedBy: 'seat-4', passed: [], passCount: 0 },
  };
}

describe('passive beats', () => {
  it('lets a Tyrant beat a straight of three to five with a single 2', () => {
    const two = combo([c('2', 'SPADE')]);
    expect(passiveBeats('tyrant', straight(3), two)).toBe(true);
    expect(passiveBeats('tyrant', straight(5), two)).toBe(true);
    expect(passiveBeats('tyrant', straight(6), two)).toBe(false);
    expect(passiveBeats('tyrant', straight(5), combo([c('A', 'HEART')]))).toBe(false);
  });

  it('lets a Wanderer beat a single 2 with a straight of five or more', () => {
    const two = combo([c('2', 'HEART')]);
    expect(passiveBeats('commoner', two, straight(5))).toBe(true);
    expect(passiveBeats('commoner', two, straight(4))).toBe(false);
    expect(passiveBeats('commoner', combo([c('A', 'HEART')]), straight(5))).toBe(false);
  });

  it('lets a Courtier beat a triple of 10s or lower with a court pair only through the Medallion', () => {
    const tens = combo([c('10', 'SPADE'), c('10', 'CLUB'), c('10', 'HEART')]);
    const jacks = combo([c('J', 'SPADE'), c('J', 'CLUB'), c('J', 'HEART')]);
    const kings = combo([c('K', 'SPADE'), c('K', 'HEART')]);
    const held = [{ id: 'precedence' as const, level: 1 }];
    expect(passiveBeats('courtier', tens, kings)).toBe(false);
    expect(passiveBeats('courtier', tens, kings, held)).toBe(true);
    expect(passiveBeats('courtier', jacks, kings, held)).toBe(false);
    expect(passiveBeats('courtier', jacks, kings, [{ id: 'precedence', level: 2 }])).toBe(true);
    expect(passiveBeats('courtier', tens, combo([c('9', 'SPADE'), c('9', 'HEART')]), held)).toBe(false);
    expect(passiveBeats('courtier', tens, combo([c('2', 'SPADE'), c('2', 'HEART')]), held)).toBe(false);
  });

  it('lets a Courtier beat a higher single of its own suit with a court card, never a 2', () => {
    const queen = combo([c('Q', 'HEART')]);
    expect(passiveBeats('courtier', combo([c('A', 'HEART')]), queen)).toBe(true);
    expect(passiveBeats('courtier', combo([c('A', 'SPADE')]), queen)).toBe(false);
    expect(passiveBeats('courtier', combo([c('2', 'HEART')]), queen)).toBe(false);
    expect(passiveBeats('courtier', combo([c('K', 'HEART')]), combo([c('9', 'HEART')]))).toBe(false);
    expect(passiveBeats('commoner', combo([c('A', 'HEART')]), queen)).toBe(false);
  });

  it('gives no class an extra beat another class has', () => {
    expect(passiveBeats('commoner', straight(3), combo([c('2', 'SPADE')]))).toBe(false);
    expect(passiveBeats('courtier', combo([c('2', 'HEART')]), straight(5))).toBe(false);
  });
});

describe('campaign turn options', () => {
  it('adds the passive beat for a seat of that class', () => {
    const state = facing(straight(4), [c('2', 'CLUB'), c('4', 'HEART'), c('9', 'DIAMOND')]);
    const base = getTurnOptions(state);
    const tyrant = campaignTurnOptions(() => rules('tyrant'))(state);
    expect(base.legalMoves.some((m) => m.type === 'SINGLE')).toBe(false);
    expect(tyrant.legalMoves.some((m) => m.type === 'SINGLE' && m.cards[0]!.rank === '2')).toBe(true);
    expect(tyrant.canPass).toBe(base.canPass);
  });

  it('leaves a seat with no class, or another class, on the base rules', () => {
    const state = facing(straight(4), [c('2', 'CLUB'), c('4', 'HEART')]);
    expect(campaignTurnOptions(() => null)(state)).toEqual(getTurnOptions(state));
    expect(campaignTurnOptions(() => rules('courtier'))(state)).toEqual(getTurnOptions(state));
  });

  it('never softens a forced bust', () => {
    const quad = [c('7', 'SPADE'), c('7', 'CLUB'), c('7', 'DIAMOND'), c('7', 'HEART')];
    const run = (['3', '4', '5', '6', '8'] as const).map((rank) => c(rank, 'HEART'));
    const state = facing(combo([c('2', 'SPADE')]), [...quad, ...run]);
    const options = campaignTurnOptions(() => rules('commoner'))(state);
    expect(options.constraint.kind).toBe('FORCED_TWO_BUST');
    expect(options.legalMoves.every((m) => m.type === 'FOUR_OF_A_KIND' || m.type === 'PAIR_CHAIN')).toBe(true);
  });
});

describe('Medallions', () => {
  const two = combo([c('2', 'HEART')]);
  it('lets Uprising reach down to a straight of four', () => {
    expect(passiveBeats('commoner', two, straight(4))).toBe(false);
    expect(passiveBeats('commoner', two, straight(4), [{ id: 'uprising', level: 1 }])).toBe(true);
  });

  it('lets Decree reach longer straights, level by level', () => {
    const two2 = combo([c('2', 'SPADE')]);
    expect(passiveBeats('tyrant', straight(7), two2)).toBe(false);
    expect(passiveBeats('tyrant', straight(7), two2, [{ id: 'decree', level: 1 }])).toBe(true);
    expect(passiveBeats('tyrant', straight(8), two2, [{ id: 'decree', level: 1 }])).toBe(false);
    expect(passiveBeats('tyrant', straight(8), two2, [{ id: 'decree', level: 2 }])).toBe(true);
  });

  it('prices a class play by class, and lets its Medallions bring it down', () => {
    expect(passiveCost('commoner', [])).toBe(0.5);
    expect(passiveCost('courtier', [])).toBe(0.75);
    expect(passiveCost('tyrant', [])).toBe(1.5);
    expect(passiveCost('commoner', [{ id: 'frugal', level: 2 }])).toBe(0);
    expect(passiveCost('tyrant', [{ id: 'blood-rite', level: 2 }])).toBe(0.5);
  });

  it('offers no class play to a seat that cannot pay for it', () => {
    const state = facing(straight(4), [c('2', 'CLUB'), c('4', 'HEART'), c('9', 'DIAMOND')]);
    const broke = campaignTurnOptions(() => rules('tyrant', [], false))(state);
    expect(broke.legalMoves.some((m) => m.type === 'SINGLE')).toBe(false);
  });

  it('keeps an Unbowed 2 from being chopped by four of a kind', () => {
    const quad = [c('7', 'SPADE'), c('7', 'CLUB'), c('7', 'DIAMOND'), c('7', 'HEART')];
    const state = facing(combo([c('2', 'SPADE')]), [...quad, c('9', 'HEART')]);
    const owner = (id: string) => (id === 'seat-4' ? rules('tyrant', [{ id: 'unbowed', level: 1 }]) : null);
    const options = campaignTurnOptions(owner)(state);
    expect(options.legalMoves.some((m) => m.type === 'FOUR_OF_A_KIND')).toBe(false);
    expect(options.canPass).toBe(true);
  });
});
