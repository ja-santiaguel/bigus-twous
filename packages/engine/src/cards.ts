import { ALL_RANKS, ALL_SUITS, type Card, cardValue, type PlayerId } from './types.js';
import { shuffle, type Rng } from './rng.js';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ALL_SUITS) {
    for (const rank of ALL_RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function sortHand(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => cardValue(a) - cardValue(b));
}

/** Deals a standard 52-card deck evenly across `playerIds` (13 cards each for 4 players). */
export function dealHands(playerIds: PlayerId[], rng: Rng): Map<PlayerId, Card[]> {
  const deck = shuffle(createDeck(), rng);
  const hands = new Map<PlayerId, Card[]>();
  for (const id of playerIds) hands.set(id, []);

  deck.forEach((card, i) => {
    const playerId = playerIds[i % playerIds.length]!;
    hands.get(playerId)!.push(card);
  });

  for (const id of playerIds) {
    hands.set(id, sortHand(hands.get(id)!));
  }
  return hands;
}

/**
 * Deals the shuffled deck round-robin into `pileCount` piles (9.13): card 1 to
 * pile 1, card 2 to pile 2, and so on, wrapping. Identical distribution to
 * dealHands — the difference is that the piles are not yet attached to any
 * player, because players claim them in the selection ceremony.
 */
export function dealPiles(pileCount: number, rng: Rng): Card[][] {
  const deck = shuffle(createDeck(), rng);
  const piles: Card[][] = Array.from({ length: pileCount }, () => []);
  deck.forEach((card, i) => {
    piles[i % pileCount]!.push(card);
  });
  // Deliberately **not** sorted. A pile is the cards in the order they came off
  // the shuffle, and that is the order a player first sees their hand in —
  // arranging it is the player's job, not the deal's. The engine re-sorts a
  // hand after each play for its own convenience; the client keeps its own
  // arrangement and is unaffected.
  return piles;
}

/** One player claiming one pile during the selection ceremony (9.13). */
export interface PileClaim {
  playerId: PlayerId;
  /** Index of the dealt pile that was claimed. */
  pileIndex: number;
  /** Position in the ceremony: 0 is the first player to pick. */
  pickIndex: number;
}

/**
 * Runs the pile selection ceremony (9.13). `firstPickerId` picks first, then
 * play proceeds clockwise (ascending seat index, wrapping) until every pile is
 * claimed.
 *
 * Picks are **blind** — no information about any pile is available to the
 * picker — so a pick is a uniform choice among the piles still unclaimed,
 * drawn from the injected seeded RNG. This makes the ceremony pure ritual: it
 * cannot advantage anyone, and it replays identically from a seed. It exists
 * so the UI has a real sequence of events to animate rather than silently
 * assigning hands.
 */
export function claimPiles(
  playerIds: PlayerId[],
  piles: Card[][],
  firstPickerId: PlayerId,
  rng: Rng,
): { hands: Map<PlayerId, Card[]>; claims: PileClaim[] } {
  const firstPickerSeat = playerIds.indexOf(firstPickerId);
  if (firstPickerSeat === -1) throw new Error(`Unknown first picker: ${firstPickerId}`);

  const remaining = piles.map((_, index) => index);
  const hands = new Map<PlayerId, Card[]>();
  const claims: PileClaim[] = [];

  for (let pickIndex = 0; pickIndex < playerIds.length; pickIndex++) {
    const playerId = playerIds[(firstPickerSeat + pickIndex) % playerIds.length]!;
    const choice = Math.floor(rng() * remaining.length);
    const pileIndex = remaining.splice(choice, 1)[0]!;
    hands.set(playerId, piles[pileIndex]!);
    claims.push({ playerId, pileIndex, pickIndex });
  }

  return { hands, claims };
}

/**
 * Assigns hands from an already-decided set of claims.
 *
 * This is the same ceremony as `claimPiles`, minus the deciding — used when
 * the picks came from somewhere the engine cannot see, which today means a
 * person clicking a pile and tomorrow means a server relaying what they
 * clicked. Validating here rather than trusting the caller is the point: this
 * is precisely the seam where untrusted input will eventually arrive.
 */
export function handsFromClaims(
  playerIds: PlayerId[],
  piles: Card[][],
  claims: PileClaim[],
): { hands: Map<PlayerId, Card[]>; claims: PileClaim[] } {
  if (claims.length !== playerIds.length) {
    throw new Error(`Expected ${playerIds.length} pile claims, got ${claims.length}`);
  }

  const hands = new Map<PlayerId, Card[]>();
  const takenPiles = new Set<number>();

  for (const claim of claims) {
    if (!playerIds.includes(claim.playerId)) throw new Error(`Unknown player id: ${claim.playerId}`);
    if (hands.has(claim.playerId)) throw new Error(`${claim.playerId} claimed more than one pile`);
    const pile = piles[claim.pileIndex];
    if (!pile) throw new Error(`No such pile: ${claim.pileIndex}`);
    if (takenPiles.has(claim.pileIndex)) throw new Error(`Pile ${claim.pileIndex} was claimed twice`);
    takenPiles.add(claim.pileIndex);
    hands.set(claim.playerId, pile);
  }

  return { hands, claims };
}

/** Finds the holder of the 3 of Spades — determines the very first round's starter. */
export function findThreeOfSpadesHolder(hands: Map<PlayerId, Card[]>): PlayerId {
  for (const [playerId, cards] of hands.entries()) {
    if (cards.some((c) => c.rank === '3' && c.suit === 'SPADE')) return playerId;
  }
  throw new Error('3 of Spades not found in any hand — deck is malformed.');
}

export function removeCards(hand: Card[], toRemove: Card[]): Card[] {
  const removeIds = new Set(toRemove.map((c) => `${c.rank}_${c.suit}`));
  return hand.filter((c) => !removeIds.has(`${c.rank}_${c.suit}`));
}
