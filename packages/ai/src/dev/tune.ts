/**
 * Weight-sweep harness (development only — not part of the shipped AI).
 *
 * Runs a candidate weight set against a fixed baseline lineup over seeded,
 * seat-rotated games and reports win rate versus chance. Used to pick the
 * numbers in difficulty.ts empirically rather than by intuition.
 */
import { createNewRound, createRng, runRoundToCompletion, type Player } from '@big-two/engine';
import { createGreedyLowestPlayer } from '../strategies/greedyLowest.js';
import { createHeuristicPlayer } from '../strategies/heuristic.js';
import type { HeuristicWeights } from '../lib/evaluate.js';
import { HARD_WEIGHTS, MEDIUM_WEIGHTS } from '../difficulty.js';

const SEATS = ['s0', 's1', 's2', 's3'];

type MakePlayer = (id: string) => Player;

/** Win rate of `subject` sitting in one seat against three `baseline` seats. */
async function winRate(subject: MakePlayer, baseline: MakePlayer, games: number): Promise<number> {
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const subjectSeat = i % SEATS.length; // rotate to cancel first-seat advantage
    const players = new Map<string, Player>(
      SEATS.map((id, seat) => [id, seat === subjectSeat ? subject(id) : baseline(id)]),
    );
    const seed = `tune-${i}`;
    const state = createNewRound(SEATS, createRng(seed), seed, 1, null, {});
    const final = await runRoundToCompletion(state, players);
    if (final.winnerOfRound === SEATS[subjectSeat]) wins++;
  }
  return wins / games;
}

const greedy: MakePlayer = (id) => createGreedyLowestPlayer(id);

async function evaluateWeights(label: string, weights: HeuristicWeights, games: number) {
  const rate = await winRate((id) => createHeuristicPlayer(id, weights), greedy, games);
  const edge = ((rate - 0.25) / 0.25) * 100;
  console.log(
    `${label.padEnd(34)} win ${(rate * 100).toFixed(1).padStart(5)}%   vs chance ${edge >= 0 ? '+' : ''}${edge.toFixed(1)}%`,
  );
  return rate;
}

async function sweep(base: HeuristicWeights, key: keyof HeuristicWeights, values: number[], games: number) {
  console.log(`\n--- sweeping ${String(key)} (base: ${base.label}) ---`);
  for (const value of values) {
    await evaluateWeights(`${String(key)}=${value}`, { ...base, [key]: value }, games);
  }
}

async function main() {
  const games = Number(process.argv[2] ?? 400);
  const mode = process.argv[3] ?? 'baseline';

  if (mode === 'baseline') {
    await evaluateWeights('MEDIUM_WEIGHTS', MEDIUM_WEIGHTS, games);
    await evaluateWeights('HARD_WEIGHTS', HARD_WEIGHTS, games);
    return;
  }

  if (mode === 'medium') {
    for (const threatUrgency of [3, 4, 5, 6, 8]) {
      for (const passThreshold of [0.6, 1.0]) {
        await evaluateWeights(
          `medium threat=${threatUrgency} pass=${passThreshold}`,
          {
            ...MEDIUM_WEIGHTS,
            threatUrgency,
            passThreshold,
          },
          games,
        );
      }
    }
    return;
  }

  if (mode === 'final') {
    const core: HeuristicWeights = {
      ...HARD_WEIGHTS,
      tempoBonus: 1,
      strengthPenalty: 3,
      cardsShedBonus: 2,
      leadStrengthMultiplier: 2,
      threatUrgency: 8,
      unbeatableBonus: 6,
    };
    await evaluateWeights('HARD candidate', core, games);
    await evaluateWeights('HARD threat12', { ...core, threatUrgency: 12 }, games);
    await evaluateWeights('HARD unbeat8', { ...core, unbeatableBonus: 8 }, games);
    await evaluateWeights('HARD pass1.5', { ...core, passThreshold: 1.5 }, games);
    const med: HeuristicWeights = {
      ...core,
      label: 'medium',
      useCardTracking: false,
      unbeatableBonus: 0,
      threatUrgency: 3,
    };
    await evaluateWeights('MEDIUM candidate', med, games);
    await evaluateWeights('MEDIUM threat8', { ...med, threatUrgency: 8 }, games);
    await evaluateWeights('MEDIUM shed1', { ...med, cardsShedBonus: 1 }, games);
    return;
  }

  /**
   * Re-fit after the 9.7 pass-lockout change.
   *
   * Passing used to cost one turn; it now forfeits the whole trick. That made
   * medium's old `passThreshold: 1.0` catastrophic — it dropped from 42.9% to
   * 31.3% against a field of easy CPUs while hard, which already contested
   * tricks at 0.6, barely moved. The cliff sits between 0.5 and 1.0, so this
   * resolves that range directly rather than re-running the whole sweep.
   */
  if (mode === 'retune') {
    for (const passThreshold of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
      await evaluateWeights(`medium pass=${passThreshold}`, { ...MEDIUM_WEIGHTS, passThreshold }, games);
    }
    await evaluateWeights('hard (current)', HARD_WEIGHTS, games);
    await evaluateWeights('hard shed3', { ...HARD_WEIGHTS, cardsShedBonus: 3 }, games);
    await evaluateWeights('hard pass0.5', { ...HARD_WEIGHTS, passThreshold: 0.5 }, games);
    return;
  }

  if (mode === 'variants') {
    const v1: HeuristicWeights = {
      ...HARD_WEIGHTS,
      tempoBonus: 1,
      strengthPenalty: 3,
      cardsShedBonus: 1.5,
      leadStrengthMultiplier: 2,
    };
    await evaluateWeights('hard+combined', v1, games);
    await evaluateWeights('hard+combined tempo0', { ...v1, tempoBonus: 0 }, games);
    await evaluateWeights('hard+combined sp4', { ...v1, strengthPenalty: 4 }, games);
    await evaluateWeights('hard+combined sp3.5', { ...v1, strengthPenalty: 3.5 }, games);
    await evaluateWeights('hard+combined shed2', { ...v1, cardsShedBonus: 2 }, games);
    await evaluateWeights('hard+combined two2.5', { ...v1, twoHoldPenalty: 2.5 }, games);
    await evaluateWeights('hard+combined bomb2', { ...v1, bombHoldPenalty: 2 }, games);
    await evaluateWeights('hard+combined threat8', { ...v1, threatUrgency: 8 }, games);
    await evaluateWeights('hard+combined unbeat6', { ...v1, unbeatableBonus: 6 }, games);
    await evaluateWeights(
      '-- NO TRACKING (medium candidate)',
      { ...v1, useCardTracking: false, unbeatableBonus: 0 },
      games,
    );
    return;
  }

  const base = mode === 'hard' ? HARD_WEIGHTS : MEDIUM_WEIGHTS;
  await sweep(base, 'passThreshold', [-2, -1, -0.5, 0, 0.5, 1, 2], games);
  await sweep(base, 'cardsShedBonus', [0, 0.5, 1, 1.5, 2, 3], games);
  await sweep(base, 'leadStrengthMultiplier', [1, 1.5, 2, 3, 4], games);
  await sweep(base, 'fracturePenalty', [0.5, 1, 2, 3], games);
  await sweep(base, 'tempoBonus', [0, 1, 2, 3], games);
  await sweep(base, 'strengthPenalty', [1, 2, 3, 4], games);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
