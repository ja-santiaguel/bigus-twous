import { createNewRound, createRng, runRoundToCompletion, type Player } from '@big-two/engine';
import { createCpuPlayer, isDifficulty, type Difficulty } from './difficulty.js';

/**
 * Headless CPU-vs-CPU simulation harness.
 *
 * Two jobs: shake rule bugs out of the engine by playing thousands of full
 * games, and measure whether the difficulty tiers actually differ in strength.
 *
 * Seat rotation matters for the second job. The 3-of-Spades opening and the
 * "winner leads the next round" rule give the starting seat a real edge, so a
 * fixed seating chart would mostly measure seat luck. Each game rotates the
 * difficulty assignment one seat, which cancels that bias out over a run
 * divisible by four.
 *
 *   npm run simulate --workspace=@big-two/ai -- 2000 hard,medium,medium,easy
 */

/** Matches the seats everything else uses; see SEAT_IDS in @big-two/session. */
const SEAT_IDS = ['seat-1', 'seat-2', 'seat-3', 'seat-4'];

function parseArgs(argv: string[]): { games: number; lineup: Difficulty[] } {
  const games = Number(argv[0] ?? 1000);
  const spec = argv[1];
  if (!spec) return { games, lineup: ['hard', 'medium', 'easy', 'easy'] };

  const lineup = spec.split(',').map((s) => s.trim());
  if (lineup.length !== 4 || !lineup.every(isDifficulty)) {
    throw new Error(`Lineup must be 4 comma-separated difficulties (easy|medium|hard), got: ${spec}`);
  }
  return { games, lineup: lineup as Difficulty[] };
}

async function main() {
  const { games, lineup } = parseArgs(process.argv.slice(2));

  // Wins are tallied per difficulty, not per seat, since the lineup rotates.
  const winsByDifficulty: Record<string, number> = {};
  const gamesByDifficulty: Record<string, number> = {};
  for (const d of lineup) {
    winsByDifficulty[d] ??= 0;
    gamesByDifficulty[d] ??= 0;
  }

  let previousWinner: string | null = null;
  let roundsWon: Record<string, number> = {};
  const startedAt = Date.now();

  for (let i = 0; i < games; i++) {
    // Rotate the lineup by one seat each game to cancel out first-seat advantage.
    const rotation = i % SEAT_IDS.length;
    const seatDifficulty = new Map<string, Difficulty>();
    SEAT_IDS.forEach((id, seat) => {
      seatDifficulty.set(id, lineup[(seat + rotation) % lineup.length]!);
    });

    const players = new Map<string, Player>(SEAT_IDS.map((id) => [id, createCpuPlayer(id, seatDifficulty.get(id)!)]));

    const seed = `sim-${i}`;
    const state = createNewRound(SEAT_IDS, createRng(seed), seed, i + 1, previousWinner, roundsWon);
    const final = await runRoundToCompletion(state, players);

    const winnerId = final.winnerOfRound!;
    winsByDifficulty[seatDifficulty.get(winnerId)!]!++;
    for (const id of SEAT_IDS) gamesByDifficulty[seatDifficulty.get(id)!]!++;

    previousWinner = winnerId;
    roundsWon = final.roundsWon;
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(`Simulated ${games} full games — lineup [${lineup.join(', ')}], seat-rotated.`);
  console.log(`Elapsed ${elapsedMs}ms (${(elapsedMs / games).toFixed(2)}ms/game).\n`);

  const rows = Object.keys(winsByDifficulty).map((difficulty) => {
    const seats = gamesByDifficulty[difficulty]! / games; // seats held per game
    const expected = games * (seats / SEAT_IDS.length);
    const wins = winsByDifficulty[difficulty]!;
    return {
      difficulty,
      seats,
      wins,
      'win %': `${((wins / games) * 100).toFixed(1)}%`,
      'vs. chance': `${wins >= expected ? '+' : ''}${(((wins - expected) / expected) * 100).toFixed(1)}%`,
    };
  });
  console.table(rows);
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exitCode = 1;
});
