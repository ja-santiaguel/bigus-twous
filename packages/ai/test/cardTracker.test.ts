import { describe, expect, it } from 'vitest';
import { detectCombo, type Card, type GameEvent, type PlayerView } from '@big-two/engine';
import { trackCards } from '../src/lib/cardTracker.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const combo = (cards: Card[]) => detectCombo(cards)!;

function view(hand: Card[], history: GameEvent[] = []): PlayerView {
  return {
    selfId: 'me',
    hand,
    opponents: [
      { id: 'a', seat: 1, cardCount: 5 },
      { id: 'b', seat: 2, cardCount: 5 },
      { id: 'c', seat: 3, cardCount: 5 },
    ],
    turnPlayerId: 'me',
    pile: null,
    roundNumber: 1,
    roundsWon: {},
    points: {},
    finishOrder: [],
    history,
  };
}

const played = (cards: Card[]): GameEvent => ({ type: 'CARDS_PLAYED', playerId: 'a', combo: combo(cards) });

const SUITS: Card['suit'][] = ['SPADE', 'CLUB', 'DIAMOND', 'HEART'];
const RANKS: Card['rank'][] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

describe('trackCards — visibility', () => {
  it('treats every card not in hand and not yet played as still in circulation', () => {
    const hand = [c('3', 'SPADE')];
    const knowledge = trackCards(view(hand, [played([c('K', 'HEART')])]));
    expect(knowledge.unseen).toHaveLength(50); // 52 - 1 in hand - 1 played
    expect(knowledge.playedCardIds.has('K_HEART')).toBe(true);
  });

  it('only ever reads the redacted view — opponents contribute nothing but card counts', () => {
    const knowledge = trackCards(view([c('3', 'SPADE')]));
    expect(knowledge.unseen).toHaveLength(51);
  });
});

describe('trackCards — isUnbeatable', () => {
  it('knows the 2 of Hearts is unbeatable once the rest of the deck is gone', () => {
    const hand = [c('2', 'HEART')];
    const allOthers: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        if (rank === '2' && suit === 'HEART') continue;
        allOthers.push({ rank, suit });
      }
    }
    const history = allOthers.map((card) => played([card]));
    const knowledge = trackCards(view(hand, history));
    expect(knowledge.isUnbeatable(combo([c('2', 'HEART')]))).toBe(true);
  });

  it('knows a lone 2 of Spades IS answerable while bomb material and higher Twos remain', () => {
    const knowledge = trackCards(view([c('2', 'SPADE')]));
    expect(knowledge.isUnbeatable(combo([c('2', 'SPADE')]))).toBe(false);
  });

  it('flags a single as beatable while any higher card is still out', () => {
    const knowledge = trackCards(view([c('K', 'SPADE')]));
    expect(knowledge.isUnbeatable(combo([c('K', 'SPADE')]))).toBe(false);
  });

  it('treats a quad of Twos as unbeatable — it is the ceiling of the game (9.4)', () => {
    const quad = combo([c('2', 'SPADE'), c('2', 'CLUB'), c('2', 'DIAMOND'), c('2', 'HEART')]);
    const knowledge = trackCards(view(quad.cards));
    expect(knowledge.isUnbeatable(quad)).toBe(true);
  });

  it('recognises a pair as unbeatable only when no two higher cards remain outside', () => {
    // Hold the two highest Aces and all Twos; the low Aces have been played, so
    // no higher pair can exist in anyone else's hand.
    const hand = [
      c('A', 'DIAMOND'),
      c('A', 'HEART'),
      c('2', 'SPADE'),
      c('2', 'CLUB'),
      c('2', 'DIAMOND'),
      c('2', 'HEART'),
    ];
    const history = [played([c('A', 'SPADE')]), played([c('A', 'CLUB')])];
    const knowledge = trackCards(view(hand, history));
    expect(knowledge.isUnbeatable(combo([c('A', 'DIAMOND'), c('A', 'HEART')]))).toBe(true);
  });

  it('a four-of-a-kind is answerable only by a higher four-of-a-kind, never by a pair chain', () => {
    const lowQuad = combo([c('3', 'SPADE'), c('3', 'CLUB'), c('3', 'DIAMOND'), c('3', 'HEART')]);
    expect(trackCards(view(lowQuad.cards)).isUnbeatable(lowQuad)).toBe(false);

    // Quad of Aces: only a quad of Twos beats it, so play all four Twos away.
    const aceQuad = combo([c('A', 'SPADE'), c('A', 'CLUB'), c('A', 'DIAMOND'), c('A', 'HEART')]);
    const twosGone = [
      played([c('2', 'SPADE')]),
      played([c('2', 'CLUB')]),
      played([c('2', 'DIAMOND')]),
      played([c('2', 'HEART')]),
    ];
    expect(trackCards(view(aceQuad.cards, twosGone)).isUnbeatable(aceQuad)).toBe(true);
  });
});
