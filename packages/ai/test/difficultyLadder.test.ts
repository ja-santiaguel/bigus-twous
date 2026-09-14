import { describe, expect, it } from 'vitest';
import { createNewRound, createRng, runRoundToCompletion, type Player } from '@big-two/engine';
import { createCpuPlayer, type Difficulty } from '../src/difficulty.js';

const SEATS = ['s0', 's1', 's2', 's3'];

/**
 * Regression guard on the actual point of the difficulty tiers: a harder CPU
 * must genuinely win more. Unit tests can prove a strategy is legal, but only
 * simulation can prove it is *better* — and the first hand-tuned weight set
 * for this evaluator was measurably worse than the naive baseline while
 * passing every unit test. This is the test that would have caught that.
 *
 * Everything is seeded, so the numbers below are deterministic, not flaky.
 * Seats rotate to cancel out the first-seat advantage that the 3-of-Spades
 * opening rule (9.1) creates.
 */
async function winRateVsField(subject: Difficulty, field: Difficulty, games: number): Promise<number> {
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const subjectSeat = i % SEATS.length;
    const players = new Map<string, Player>(
      SEATS.map((id, seat) => [id, createCpuPlayer(id, seat === subjectSeat ? subject : field)]),
    );
    const seed = `ladder-${i}`;
    const state = createNewRound(SEATS, createRng(seed), seed, 1, null, {});
    const final = await runRoundToCompletion(state, players);
    if (final.winnerOfRound === SEATS[subjectSeat]) wins++;
  }
  return wins / games;
}

const GAMES = 400;
const CHANCE = 0.25;

describe('difficulty ladder', () => {
  it('hard, medium and easy are strictly ordered by strength', async () => {
    const hard = await winRateVsField('hard', 'easy', GAMES);
    const medium = await winRateVsField('medium', 'easy', GAMES);

    // Each tier must beat pure chance against a field of easy CPUs.
    expect(medium).toBeGreaterThan(CHANCE);
    expect(hard).toBeGreaterThan(CHANCE);

    // And the ladder must actually be a ladder.
    expect(hard).toBeGreaterThan(medium);

    // Guard the margins too, so a regression that merely flattens the tiers
    // without inverting them still fails.
    expect(medium).toBeGreaterThan(0.33);
    expect(hard).toBeGreaterThan(0.5);
  }, 120_000);

  it('hard beats medium head-to-head in a two-versus-two field', async () => {
    let hardWins = 0;
    // The hard-over-medium edge is real but narrow (~54/46), so this needs
    // enough games to resolve it — a few hundred sits inside the noise band.
    const games = 1200;
    for (let i = 0; i < games; i++) {
      const rotation = i % SEATS.length;
      const lineup: Difficulty[] = ['hard', 'medium', 'hard', 'medium'];
      const seatDifficulty = new Map<string, Difficulty>(
        SEATS.map((id, seat) => [id, lineup[(seat + rotation) % lineup.length]!]),
      );
      const players = new Map<string, Player>(SEATS.map((id) => [id, createCpuPlayer(id, seatDifficulty.get(id)!)]));
      const seed = `h2h-${i}`;
      const state = createNewRound(SEATS, createRng(seed), seed, 1, null, {});
      const final = await runRoundToCompletion(state, players);
      if (seatDifficulty.get(final.winnerOfRound!) === 'hard') hardWins++;
    }
    expect(hardWins / games).toBeGreaterThan(0.5);
  }, 120_000);
});
