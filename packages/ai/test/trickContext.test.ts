import { describe, expect, it } from 'vitest';
import { detectCombo, type Card, type Combo, type GameEvent, type PlayerView } from '@big-two/engine';
import { readTrickContext } from '../src/lib/trickContext.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
const pileCombo = detectCombo([c('9', 'SPADE')])!;

function view(history: GameEvent[], opponentCounts = [5, 5, 5], pile: Combo | null = pileCombo): PlayerView {
  return {
    selfId: 'me',
    hand: [c('3', 'SPADE')],
    opponents: [
      { id: 'a', seat: 1, cardCount: opponentCounts[0]! },
      { id: 'b', seat: 2, cardCount: opponentCounts[1]! },
      { id: 'c', seat: 3, cardCount: opponentCounts[2]! },
    ],
    turnPlayerId: 'me',
    pile,
    roundNumber: 1,
    roundsWon: {},
    points: {},
    finishOrder: [],
    history,
  };
}

describe('readTrickContext', () => {
  it('infers my own seat as the one missing from the opponent list', () => {
    expect(readTrickContext(view([])).selfSeat).toBe(0);
  });

  it('remembers passes made earlier in the trick, even before the current pile', () => {
    // Passing forfeits the whole trick (9.7), so 'b' is out for good — a later
    // play by 'a' does not readmit them. Only a TRICK_RESET clears the slate.
    const history: GameEvent[] = [
      { type: 'PLAYER_PASSED', playerId: 'b' },
      { type: 'CARDS_PLAYED', playerId: 'a', combo: pileCombo },
      { type: 'PLAYER_PASSED', playerId: 'c' },
    ];
    const ctx = readTrickContext(view(history));
    expect(ctx.pileOwner).toBe('a');
    expect(ctx.liveOpponents.map((o) => o.id).sort()).toEqual(['a']);
  });

  it('ignores opponents who have already gone out', () => {
    // The round runs on until only one player holds cards, so a finished seat
    // stays in the opponent list at zero cards. It can neither answer a play
    // nor be denied the lead, and must not read as a threat.
    const ctx = readTrickContext(view([], [0, 4, 9]), 3);
    expect(ctx.liveOpponents.map((o) => o.id)).toEqual(['b', 'c']);
    expect(ctx.threats).toHaveLength(0);
    expect(ctx.minOpponentCards).toBe(4);
  });

  it('clears pass memory at a trick reset', () => {
    const history: GameEvent[] = [
      { type: 'PLAYER_PASSED', playerId: 'a' },
      { type: 'TRICK_RESET', leader: 'me', wonBy: 'me' },
    ];
    const ctx = readTrickContext(view(history, [5, 5, 5], null));
    expect(ctx.pileOwner).toBeNull();
    expect(ctx.liveOpponents).toHaveLength(3);
  });

  it('orders opponents by turn order starting after my seat', () => {
    const ctx = readTrickContext(view([]));
    expect(ctx.turnOrderAfterSelf.map((o) => o.seat)).toEqual([1, 2, 3]);
  });

  it('flags opponents at or below the threat threshold', () => {
    const ctx = readTrickContext(view([], [8, 2, 9]), 3);
    expect(ctx.threats.map((t) => t.id)).toEqual(['b']);
    expect(ctx.minOpponentCards).toBe(2);
  });
});
