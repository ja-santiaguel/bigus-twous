import {
  claimPiles,
  dealPiles,
  findThreeOfSpadesHolder,
  handsFromClaims,
  removeCards,
  sortHand,
  type PileClaim,
} from './cards.js';
import { lowestCard } from './legalMoves.js';
import { addScores, scoreRound } from './scoring.js';
import { cardValue, type Card, type Combo, type PlayerId } from './types.js';
import type { Rng } from './rng.js';

export interface PlayerState {
  id: PlayerId;
  seat: number;
  hand: Card[];
  /** Reserved for the Phase 5/6 chess-clock feature; unused/enforced in v1. */
  timeBankMs?: number;
}

export interface TrickState {
  pile: Combo | null;
  /** Player who most recently played (not passed) a combo. Becomes the next leader once the trick clears. */
  lastPlayedBy: PlayerId | null;
  /**
   * Everyone who has passed out of the current trick, in pass order (9.7).
   *
   * Passing forfeits the **whole trick**, not just one turn: a seat in this
   * list is skipped for the rest of the trick even if someone else plays after
   * them. The list clears only when the trick closes.
   */
  passed: PlayerId[];
  /** Number of passes on the current trick. Mirrors `passed.length`. */
  passCount: number;
}

export type GameEvent =
  /** One player claiming one pile during the selection ceremony (9.13). Blind — carries no card data. */
  | { type: 'PILE_CLAIMED'; playerId: PlayerId; pileIndex: number; pickIndex: number }
  | { type: 'HAND_DEALT'; playerId: PlayerId; cardCount: number }
  | { type: 'CARDS_PLAYED'; playerId: PlayerId; combo: Combo }
  | { type: 'PLAYER_PASSED'; playerId: PlayerId }
  /** A player emptied their hand. `place` is 0-based: 0 is first out. */
  | { type: 'PLAYER_FINISHED'; playerId: PlayerId; place: number }
  /** `wonBy` took the trick; `leader` opens the next one — they differ only when the winner has gone out. */
  | { type: 'TRICK_RESET'; leader: PlayerId; wonBy: PlayerId }
  | { type: 'ROUND_ENDED'; winner: PlayerId; finishOrder: PlayerId[] };

export type GamePhase = 'PLAYING' | 'ROUND_END';

export interface GameState {
  players: PlayerState[];
  turnIndex: number;
  trick: TrickState;
  roundNumber: number;
  rngSeed: string;
  phase: GamePhase;
  history: GameEvent[];
  /** Rounds each player has won outright (finished first). */
  roundsWon: Record<PlayerId, number>;
  /** Running match points (9.15), updated once when the round ends. */
  points: Record<PlayerId, number>;
  /** Players who have emptied their hand, in finishing order. */
  finishOrder: PlayerId[];
  /**
   * The card the opening play must contain (9.1) — the starter's lowest card.
   * Only enforceable while `firstPlayPending` is true.
   *
   * In round one the starter is the holder of the 3 of Spades and this *is*
   * the 3 of Spades, because nothing is lower. In later rounds the starter is
   * the previous winner and it is whatever their own lowest card happens to
   * be. One rule, two readings — which is why it is stored as a card rather
   * than as the single combo it used to be.
   */
  openingCard: Card;
  firstPlayPending: boolean;
  winnerOfRound: PlayerId | null;
}

/**
 * Redacted, per-player view of the state — hides other players' hands.
 * This is the ONLY view CPU strategies, UI, and (eventually) network clients
 * are allowed to see. Never pass the raw GameState to a Player.
 */
export interface PlayerView {
  selfId: PlayerId;
  hand: Card[];
  opponents: { id: PlayerId; seat: number; cardCount: number }[];
  turnPlayerId: PlayerId;
  pile: Combo | null;
  roundNumber: number;
  roundsWon: Record<PlayerId, number>;
  points: Record<PlayerId, number>;
  /** Players already out, in finishing order. Public — everyone watched it happen. */
  finishOrder: PlayerId[];
  history: GameEvent[];
}

export function toPlayerView(state: GameState, playerId: PlayerId): PlayerView {
  const self = state.players.find((p) => p.id === playerId);
  if (!self) throw new Error(`Unknown player id: ${playerId}`);
  return {
    selfId: playerId,
    hand: self.hand,
    opponents: state.players
      .filter((p) => p.id !== playerId)
      .map((p) => ({ id: p.id, seat: p.seat, cardCount: p.hand.length })),
    turnPlayerId: state.players[state.turnIndex]!.id,
    pile: state.trick.pile,
    roundNumber: state.roundNumber,
    roundsWon: state.roundsWon,
    points: state.points,
    finishOrder: state.finishOrder,
    history: state.history,
  };
}

/**
 * Starts a new round. `previousWinner` is null only for the very first round
 * of a match; otherwise it's the prior round's winner, who both picks their
 * pile first (9.13) and starts the round (9.1).
 *
 * Sequence, all driven by the injected seeded RNG so the whole round replays
 * from `rngSeed`:
 *   1. Shuffle and deal the deck round-robin into four piles (9.13).
 *   2. Run the blind pile selection ceremony, first picker then clockwise.
 *   3. Determine the starter per 9.1 — the 3-of-Spades holder in round 1, the
 *      previous winner thereafter. Note this is independent of pile pick order:
 *      in round 1 the first picker is random and usually is NOT the starter.
 */
export interface NewRoundOptions {
  /**
   * Who claims a pile first. Defaults to the previous winner (9.13), falling
   * back to a seeded-random seat in round one.
   *
   * Purely presentational: picks are blind, so the order carries no
   * information and cannot advantage anyone. It exists so a UI can let a human
   * pick first rather than watch three computers choose before them.
   */
  firstPicker?: PlayerId;
  /**
   * Pre-dealt piles, when the caller dealt them itself.
   *
   * A client that runs the ceremony interactively must hold the piles before
   * the round exists — you cannot click a pile that has not been dealt.
   * Passing them back in builds exactly the round the engine would have built
   * on its own.
   */
  piles?: Card[][];
  /**
   * Pre-resolved claims, for when a person chose rather than the RNG.
   *
   * Supplying these makes the round no longer reproducible from `rngSeed`
   * alone, because a human choice is not in the seed. It stays replayable from
   * the event log, which records every claim — and the log, not the seed, is
   * what a server would ship to a reconnecting client.
   */
  claims?: PileClaim[];
  /** Running match points carried in from previous rounds. */
  points?: Record<PlayerId, number>;
  /**
   * Each player's seat at the table, when not every seat is dealt in: a
   * player keeps their own chair while an empty one sits out the round.
   * Defaults to each player's position in `playerIds`.
   */
  seats?: number[];
}

/** Whether every card of the deck is in someone's hand. */
function dealsEveryCard(hands: Map<PlayerId, Card[]>): boolean {
  let count = 0;
  for (const cards of hands.values()) count += cards.length;
  return count === 52;
}

/** Whoever holds the lowest card in play. */
function holderOfLowestCard(hands: Map<PlayerId, Card[]>): PlayerId {
  let best: { id: PlayerId; card: Card } | null = null;
  for (const [id, cards] of hands.entries()) {
    if (cards.length === 0) continue;
    const card = lowestCard(cards);
    if (!best || cardValue(card) < cardValue(best.card)) best = { id, card };
  }
  if (!best) throw new Error('No cards in play.');
  return best.id;
}

export function createNewRound(
  playerIds: PlayerId[],
  rng: Rng,
  rngSeed: string,
  roundNumber: number,
  previousWinner: PlayerId | null,
  roundsWon: Record<PlayerId, number>,
  options: NewRoundOptions = {},
): GameState {
  const piles = options.piles ?? dealPiles(playerIds.length, rng);
  const firstPickerId = options.firstPicker ?? previousWinner ?? playerIds[Math.floor(rng() * playerIds.length)]!;
  const { hands, claims } = options.claims
    ? handsFromClaims(playerIds, piles, options.claims)
    : claimPiles(playerIds, piles, firstPickerId, rng);

  // The 3 of Spades opens (9.1). When a seat sits out and its pile is set
  // aside unplayed, the 3 of Spades may be among those cards: then whoever
  // holds the lowest card in play opens with it instead. A full deal is
  // unchanged.
  const starterId =
    previousWinner && playerIds.includes(previousWinner)
      ? previousWinner
      : dealsEveryCard(hands)
        ? findThreeOfSpadesHolder(hands)
        : holderOfLowestCard(hands);
  const starterIndex = playerIds.indexOf(starterId);

  const players: PlayerState[] = playerIds.map((id, index) => ({
    id,
    seat: options.seats?.[index] ?? index,
    hand: hands.get(id)!,
  }));

  const openingCard = lowestCard(hands.get(starterId)!);

  // Ceremony first, then hands — the UI animates the log in order.
  const history: GameEvent[] = [
    ...claims.map((claim): GameEvent => ({
      type: 'PILE_CLAIMED',
      playerId: claim.playerId,
      pileIndex: claim.pileIndex,
      pickIndex: claim.pickIndex,
    })),
    ...players.map((p): GameEvent => ({
      type: 'HAND_DEALT',
      playerId: p.id,
      cardCount: p.hand.length,
    })),
  ];

  return {
    players,
    turnIndex: starterIndex,
    trick: { pile: null, lastPlayedBy: null, passed: [], passCount: 0 },
    roundNumber,
    rngSeed,
    phase: 'PLAYING',
    history,
    roundsWon,
    points: options.points ?? {},
    finishOrder: [],
    openingCard,
    firstPlayPending: true,
    winnerOfRound: null,
  };
}

/** Next seat clockwise from `fromIndex` that satisfies `canAct`, or `fromIndex` if none does. */
function seatAfter(
  players: readonly PlayerState[],
  fromIndex: number,
  canAct: (player: PlayerState) => boolean,
): number {
  for (let step = 1; step <= players.length; step++) {
    const index = (fromIndex + step) % players.length;
    if (canAct(players[index]!)) return index;
  }
  return fromIndex;
}

/**
 * Players who could still answer the standing pile: they hold cards, they do
 * not already own the pile, and they have not passed out of this trick.
 */
function contenders(players: readonly PlayerState[], trick: TrickState): PlayerState[] {
  return players.filter((p) => p.hand.length > 0 && p.id !== trick.lastPlayedBy && !trick.passed.includes(p.id));
}

/**
 * Decides what happens after an action: either the trick closes — nobody is
 * left who may answer it — or the turn moves on to the next seat still in it.
 *
 * Both a play and a pass can close a trick. A pass does it the obvious way; a
 * play does it when everyone else has already passed or gone out, which is
 * what happens when the last contender takes a trick the rest abandoned.
 */
function settle(
  players: readonly PlayerState[],
  trick: TrickState,
  actorIndex: number,
): { trick: TrickState; turnIndex: number; events: GameEvent[] } {
  if (trick.lastPlayedBy !== null && contenders(players, trick).length === 0) {
    const wonBy = trick.lastPlayedBy;
    const winnerIndex = players.findIndex((p) => p.id === wonBy);
    // The trick's winner leads the next one — unless taking it emptied their
    // hand, in which case the lead passes clockwise to whoever still has cards.
    const leaderIndex =
      players[winnerIndex]!.hand.length > 0 ? winnerIndex : seatAfter(players, winnerIndex, (p) => p.hand.length > 0);
    return {
      trick: { pile: null, lastPlayedBy: null, passed: [], passCount: 0 },
      turnIndex: leaderIndex,
      events: [{ type: 'TRICK_RESET', leader: players[leaderIndex]!.id, wonBy }],
    };
  }

  return {
    trick,
    turnIndex: seatAfter(players, actorIndex, (p) => p.hand.length > 0 && !trick.passed.includes(p.id)),
    events: [],
  };
}

/** Applies a validated PLAY action, returning a new state. Pure — no mutation of `state`. */
export function applyPlay(state: GameState, playerId: PlayerId, combo: Combo): GameState {
  const playerIndex = state.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) throw new Error(`Unknown player id: ${playerId}`);
  const player = state.players[playerIndex]!;
  const newHand = sortHand(removeCards(player.hand, combo.cards));

  const players = state.players.slice();
  players[playerIndex] = { ...player, hand: newHand };

  const events: GameEvent[] = [{ type: 'CARDS_PLAYED', playerId, combo }];

  const wentOut = newHand.length === 0;
  const finishOrder = wentOut ? [...state.finishOrder, playerId] : state.finishOrder;
  if (wentOut) events.push({ type: 'PLAYER_FINISHED', playerId, place: finishOrder.length - 1 });

  const trick: TrickState = {
    pile: combo,
    lastPlayedBy: playerId,
    // Passing forfeits the whole trick (9.7), so a play does not readmit the
    // seats that already passed — only the trick closing does.
    passed: state.trick.passed,
    passCount: state.trick.passed.length,
  };

  // The round runs until only one player still holds cards, so every seat earns
  // a placement (9.15) rather than the deal ending the instant someone goes out.
  if (finishOrder.length >= players.length - 1) {
    const winner = finishOrder[0]!;
    events.push({ type: 'ROUND_ENDED', winner, finishOrder });
    return {
      ...state,
      players,
      trick,
      finishOrder,
      firstPlayPending: false,
      phase: 'ROUND_END',
      winnerOfRound: winner,
      roundsWon: { ...state.roundsWon, [winner]: (state.roundsWon[winner] ?? 0) + 1 },
      points: addScores(state.points, scoreRound(finishOrder, players)),
      history: [...state.history, ...events],
    };
  }

  const settled = settle(players, trick, playerIndex);
  return {
    ...state,
    players,
    trick: settled.trick,
    turnIndex: settled.turnIndex,
    finishOrder,
    firstPlayPending: false,
    phase: 'PLAYING',
    winnerOfRound: null,
    history: [...state.history, ...events, ...settled.events],
  };
}

/** Applies a validated PASS action, returning a new state. Handles trick reset when the table comes back around. */
export function applyPass(state: GameState, playerId: PlayerId): GameState {
  const actorIndex = state.players.findIndex((p) => p.id === playerId);
  if (actorIndex === -1) throw new Error(`Unknown player id: ${playerId}`);

  const passed = [...state.trick.passed, playerId];
  const settled = settle(state.players, { ...state.trick, passed, passCount: passed.length }, actorIndex);

  return {
    ...state,
    trick: settled.trick,
    turnIndex: settled.turnIndex,
    history: [...state.history, { type: 'PLAYER_PASSED', playerId }, ...settled.events],
  };
}

/**
 * Next seat to act: skips players who are out of cards and players who have
 * passed out of the current trick (9.7).
 *
 * `applyPlay` and `applyPass` set `turnIndex` themselves, because only they
 * know whether the trick closed — a closing trick hands the turn to its winner
 * rather than to the next seat round. This stays exported for callers that
 * want to ask the question directly.
 */
export function nextTurnIndex(state: GameState): number {
  return seatAfter(state.players, state.turnIndex, (p) => p.hand.length > 0 && !state.trick.passed.includes(p.id));
}
