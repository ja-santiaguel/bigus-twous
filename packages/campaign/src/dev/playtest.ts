/**
 * Playtest harness (development only — not part of the shipped game).
 *
 * Plays whole campaign runs card by card: the engine deals, the heuristic AI
 * plays every seat — yours at 'hard', a competent player, the computers at
 * their room's difficulty — and the campaign's own turn options are in force,
 * so class plays are offered, chosen and paid for exactly as at a real table.
 * Around the cards it plays a run as a sensible person would: takes ordinary
 * tables when poor and elites when flush, stops at a merchant with gold to
 * spare, takes the spoils, calls a Reckoning as soon as it may.
 *
 *   npx tsx src/dev/playtest.ts [runs per class]
 *
 * Reports, per class: runs won, where runs end, tables won and lost, class
 * plays made and what they cost, Medallions gathered, and gold at each depth.
 */
import {
  createNewRound,
  createRng,
  dealPiles,
  toPlayerView,
  applyPass,
  applyPlay,
  cardValue,
  type GameState,
} from '@big-two/engine';
import { createCpuPlayer } from '@big-two/ai';
import {
  ARCHETYPES,
  buyMedallion,
  campaignTurnOptions,
  actInEvent,
  canCallReckoning,
  inPlay,
  leaveEvent,
  canPayForPlay,
  choices,
  claimReward,
  CLASS_IDS,
  endHand,
  enterNode,
  entryCost,
  leaveShop,
  medallionPrice,
  passiveBeats,
  payForPlay,
  playCost,
  SEAT_IDS,
  startHand,
  startRun,
  type ClassId,
  type RunState,
} from '../index.js';

interface Tally {
  runs: number;
  won: number;
  endedAtDepth: number[];
  tablesWon: number;
  tablesLost: number;
  elitesWon: number;
  hands: number;
  classPlays: number;
  classPlayGold: number;
  medallions: number;
  goldAtDepth: number[][];
  firsts: number;
  reckonings: number;
  reckoningsWon: number;
  swiftGold: number;
  events: number;
  eventGold: number;
  broke: number;
}

async function playHand(run: RunState, seed: string, tally: Tally): Promise<RunState> {
  let current = run;
  const table = () => current.table!;
  const rng = createRng(seed);
  // Broke seats sit out: the others pick three of the four piles.
  const playing = inPlay(table()).map((s) => s.id);
  const piles = dealPiles(4, rng);
  const claims = playing.map((playerId, pickIndex) => ({ playerId, pileIndex: pickIndex, pickIndex }));
  let state: GameState = createNewRound(
    playing,
    rng,
    seed,
    1,
    null,
    {},
    {
      piles,
      claims,
      seats: playing.map((id) => SEAT_IDS.indexOf(id)),
    },
  );
  const options = campaignTurnOptions((id) => {
    const seat = table().seats.find((s) => s.id === id);
    return seat ? { classId: seat.classId, medallions: seat.medallions, canPay: canPayForPlay(table(), seat) } : null;
  });
  for (let turn = 0; turn < 4000 && state.phase !== 'ROUND_END'; turn++) {
    const actor = state.players[state.turnIndex]!;
    const seat = table().seats.find((s) => s.id === actor.id)!;
    const difficulty = seat.persona ? seat.persona.difficulty : 'hard';
    const { legalMoves, canPass } = options(state);
    const move = await createCpuPlayer(actor.id, difficulty).getMove(
      toPlayerView(state, actor.id),
      legalMoves,
      canPass,
    );
    if (move.kind === 'PASS') {
      state = applyPass(state, actor.id);
      continue;
    }
    const pile = state.trick.pile;
    if (pile && passiveBeats(seat.classId, pile, move.combo, seat.medallions)) {
      if (!seat.persona) {
        tally.classPlays += 1;
        tally.classPlayGold += playCost(table(), seat);
      }
      current = { ...current, table: payForPlay(table(), actor.id) };
    }
    state = applyPlay(state, actor.id, move.combo);
  }
  const rest = playing.filter((id) => !state.finishOrder.includes(id));
  const placing = [...state.finishOrder, ...rest];
  if (placing[0] === 'seat-1') tally.firsts += 1;
  tally.hands += 1;
  const reckoning = current.table!.hand?.reckoning ?? false;
  const after = endHand(current, { placing, wentOutWith: {} });
  if (reckoning) {
    tally.reckonings += 1;
    if (placing[0] === 'seat-1') tally.reckoningsWon += 1;
    tally.swiftGold += after.lastHand?.swift ?? 0;
  }
  tally.broke += after.lastHand?.left.filter((l) => l.persona).length ?? 0;
  return after;
}

/** The node a sensible player takes. */
function chooseNode(run: RunState): string {
  const open = choices(run);
  const cost = (id: string) =>
    entryCost(
      run,
      open.find((n) => n.id === id)!,
    ) ?? 0;
  const merchant = open.find((n) => n.kind === 'merchant');
  const tables = open.filter((n) => n.kind === 'table' || n.kind === 'throne');
  const event = open.find((n) => n.kind === 'event');
  const elite = tables.find((n) => n.archetype && ARCHETYPES[n.archetype].elite);
  const cheapest = [...tables].sort((a, b) => cost(a.id) - cost(b.id))[0];
  if (merchant && (tables.length === 0 || run.worth > 3 * cost(cheapest!.id))) return merchant.id;
  if (elite && run.worth > 4 * cost(elite.id)) return elite.id;
  // A ? about half the time it is on offer.
  if (event && (tables.length === 0 || (run.draws + run.path.length) % 2 === 0)) return event.id;
  return (cheapest ?? open[0]!).id;
}

async function playRun(classId: ClassId, n: number, tally: Tally) {
  let run = startRun(`playtest-${classId}-${n}`, classId);
  let hand = 0;
  let lastDepthLogged = -1;
  for (let step = 0; step < 2000; step++) {
    if (run.phase === 'map') {
      if (run.tier !== lastDepthLogged) {
        (tally.goldAtDepth[run.tier] ??= []).push(run.worth);
        lastDepthLogged = run.tier;
      }
      const node = chooseNode(run);
      const wasElite = run.offers[node]?.elite ?? false;
      run = enterNode(run, node);
      if (run.phase === 'table') (run as RunState & { _elite?: boolean })._elite = wasElite;
    } else if (run.phase === 'shop') {
      for (const id of [...run.shopOffers]) {
        const price = medallionPrice(id, run.tier);
        if (run.worth - price > 250 + run.tier * 150) {
          run = buyMedallion(run, id);
        }
      }
      run = leaveShop(run);
    } else if (run.phase === 'reward') {
      run = claimReward(run, 0);
    } else if (run.phase === 'event') {
      // A sensible player: stakes the Ferryman when the stake is small beside
      // their gold and calls toward the middle, taking after two; opens the
      // middle coffer; haggles with the Tithe-Taker while the odds are even.
      const before = run.worth;
      tally.events += 1;
      for (let i = 0; i < 12 && run.phase === 'event'; i++) {
        const event = run.event!;
        if (event.id === 'ferryman') {
          if (event.over) run = leaveEvent(run);
          else if (event.turned.length === 0)
            run = actInEvent(run, run.worth > 6 * event.stake ? { kind: 'stake' } : { kind: 'decline' });
          else if (event.calls >= 2) run = actInEvent(run, { kind: 'take' });
          else run = actInEvent(run, { kind: 'call', higher: cardValue(event.turned.at(-1)!) < 26 });
        } else if (event.id === 'reliquary') {
          run = event.opened === null ? actInEvent(run, { kind: 'open', coffer: 1 }) : leaveEvent(run);
        } else {
          if (event.over) run = leaveEvent(run);
          else if (!event.deaf && event.haggles < 2) run = actInEvent(run, { kind: 'haggle' });
          else run = actInEvent(run, { kind: 'pay' });
        }
      }
      tally.eventGold += run.worth - before;
    } else if (run.phase === 'table') {
      const elite = (run as RunState & { _elite?: boolean })._elite ?? false;
      // Holding the tribute wins at the last hand, so a sensible player only
      // calls a Reckoning with hands to spare.
      // A Reckoning when one may be called, with a hand or more to spare.
      const t = run.table!;
      const reckon = process.env.RECKON !== '0' && canCallReckoning(t) && t.option.hands - t.handsPlayed >= 3;
      run = startHand(run, reckon);
      run = await playHand(run, `playtest-${classId}-${n}-${hand++}`, tally);
      const end = run.lastHand?.end;
      if (end?.kind === 'won') {
        tally.tablesWon += 1;
        if (elite) tally.elitesWon += 1;
      }
      if (end?.kind === 'closed') tally.tablesLost += 1;
      if (run.phase !== 'table') (run as RunState & { _elite?: boolean })._elite = false;
    } else break;
  }
  tally.runs += 1;
  if (run.phase === 'won') tally.won += 1;
  tally.endedAtDepth[run.tier] = (tally.endedAtDepth[run.tier] ?? 0) + 1;
  tally.medallions += run.medallions.reduce((sum, m) => sum + m.level, 0);
}

async function main() {
  const perClass = Number(process.argv[2] ?? 40);
  const only = process.argv[3] as ClassId | undefined;
  for (const classId of only ? [only] : CLASS_IDS) {
    const tally: Tally = {
      runs: 0,
      won: 0,
      endedAtDepth: [],
      tablesWon: 0,
      tablesLost: 0,
      elitesWon: 0,
      hands: 0,
      classPlays: 0,
      classPlayGold: 0,
      medallions: 0,
      goldAtDepth: [],
      firsts: 0,
      reckonings: 0,
      reckoningsWon: 0,
      swiftGold: 0,
      events: 0,
      eventGold: 0,
      broke: 0,
    };
    for (let n = 0; n < perClass; n++) await playRun(classId, n, tally);
    const avg = (xs: number[] | undefined) =>
      xs && xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
    console.log(
      JSON.stringify({
        class: classId,
        runs: tally.runs,
        winRate: +(tally.won / tally.runs).toFixed(2),
        endedAtDepth: [0, 1, 2, 3, 4].map((d) => tally.endedAtDepth[d] ?? 0),
        tablesWonPerRun: +(tally.tablesWon / tally.runs).toFixed(2),
        tablesLostPerRun: +(tally.tablesLost / tally.runs).toFixed(2),
        elitesWonPerRun: +(tally.elitesWon / tally.runs).toFixed(2),
        handsPerRun: +(tally.hands / tally.runs).toFixed(1),
        firstPlaceRate: +(tally.firsts / tally.hands).toFixed(2),
        classPlaysPerHand: +(tally.classPlays / tally.hands).toFixed(2),
        classPlayGoldPerRun: Math.round(tally.classPlayGold / tally.runs),
        medallionLevelsPerRun: +(tally.medallions / tally.runs).toFixed(1),
        goldArrivingAtDepth: [0, 1, 2, 3, 4].map((d) => avg(tally.goldAtDepth[d])),
        reckoningsPerRun: +(tally.reckonings / tally.runs).toFixed(2),
        reckoningWinRate: tally.reckonings ? +(tally.reckoningsWon / tally.reckonings).toFixed(2) : 0,
        swiftGoldPerRun: Math.round(tally.swiftGold / tally.runs),
        eventsPerRun: +(tally.events / tally.runs).toFixed(2),
        eventGoldPerEvent: tally.events ? Math.round(tally.eventGold / tally.events) : 0,
        brokeSeatsPerRun: +(tally.broke / tally.runs).toFixed(2),
      }),
    );
  }
}

void main();
