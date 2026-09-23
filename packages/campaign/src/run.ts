import { createRng, type PlayerId, type Rng } from '@big-two/engine';
import { CLASSES, type ClassId } from './classes.js';
import { LEGEND_NAMES } from './ladder.js';
import { CPU_NAMES } from './personas.js';
import { finaleOption, nodeCost, rewardOffers, shopOffers, tableOption, type RewardOffer } from './ladder.js';
import { depthOf, generateMap, nodeById, reachable, type MapNode, type RunMap } from './map.js';
import { gain, levelOf, medallionPrice, type Held, type MedallionId } from './medallions.js';
import {
  beginHand,
  stakeFor,
  finishHand,
  openTable,
  PLAYER_KEY,
  raiseHand,
  you,
  type HandOutcome,
  type HandResult,
  type TableOption,
  type TableState,
} from './table.js';
import type { VestigeRecord } from './vestiges.js';
import { actOnEvent, drawEvent, eventOver, type EventAction, type EventId, type EventState } from './events.js';

/**
 * A campaign run, from the choice of class to the Hollow Throne or going broke
 * on the way down.
 *
 * Pure: every step takes a run and returns the next one, so the screens only
 * show it and a save is the object itself. Randomness is drawn from the run's
 * seed and a counter, never from a live generator, so a saved run resumes
 * exactly and the same seed descends the same map.
 *
 *   map       choosing the next node on the map; each table open to you is
 *             already dealt, so who sits there is known before you choose
 *   table     playing hands
 *   reward    a table won: choosing a Medallion from what it offers
 *   shop      at a Bone Merchant
 *   event     at a ? node: a wager, a pick or a bargain (see ./events)
 *   won/lost  the run is over
 */

export type RunPhase = 'map' | 'table' | 'reward' | 'shop' | 'event' | 'won' | 'lost';

export interface RunState {
  /** 4: tables are dealt on arrival at the map. An earlier save is not resumed. */
  version: 4;
  seed: string;
  /**
   * The run's name, drawn from its seed: what you are called at its tables,
   * and what a run that takes the throne is called when it sits at later
   * finales as a Vestige.
   */
  name: string;
  classId: ClassId;
  /** Your Worth off the table. At a table, your seat holds it. */
  worth: number;
  /** Your build: your Medallions and their levels. */
  medallions: Held[];
  /** This run's descent. */
  map: RunMap;
  /** The nodes passed, top first: tables won and merchants visited. */
  path: string[];
  /** The row you are choosing in, or at: the room's tier. */
  tier: number;
  phase: RunPhase;
  /** The tables open to you now, by node: dealt when you arrive on the map. */
  offers: Record<string, TableOption>;
  /** The node being played at. */
  nodeId: string | null;
  /** Its table. */
  chosen: TableOption | null;
  table: TableState | null;
  shopOffers: MedallionId[];
  /** What the table just won offers, while choosing. */
  rewards: RewardOffer[];
  /** The ? event under way, at a ? node. */
  event?: EventState | null;
  /** The events met this run, so the next ? is one not met yet while any are left. */
  seenEvents?: EventId[];
  /** Last Rites has been spent this run. */
  lastRitesUsed: boolean;
  /** The last hand's result, for the screens. */
  lastHand: HandOutcome | null;
  /** How the run has gone. */
  stats: { tablesWon: number; handsPlayed: number; raises: number; bestWorth: number; tablesClosed: number };
  /** Draws taken from the seed so far. */
  draws: number;
  /** Times the map has been dealt: each arrival deals fresh tables. */
  round: number;
}

/** A fresh generator for the next draw, and the run with its counter moved on. */
function draw(run: RunState): [Rng, RunState] {
  return [createRng(`${run.seed}:campaign:${run.draws}`), { ...run, draws: run.draws + 1 }];
}

/**
 * Short enough to sit over a seat's fan on a phone, where a name has about ten
 * letters of room: a word for the dark, and a word for what a gambler owes.
 */
const RUN_EPITHETS = ['Ashen', 'Pale', 'Grey', 'Bleak', 'Iron', 'Last', 'Dusk', 'Grim', 'Cold', 'Sunk', 'Hush', 'Worn'];
const RUN_NOUNS = [
  'Oath',
  'Vigil',
  'Toll',
  'Wake',
  'Bell',
  'Debt',
  'Tithe',
  'Crown',
  'Wager',
  'Relic',
  'Shroud',
  'Ember',
];

/** A run's name: two words from its seed, the same every time for the same seed. */
/** A run named by one word alone, about one run in three: a name like a title. */
const RUN_SINGLES = [
  'Vesper',
  'Gloam',
  'Mourne',
  'Sable',
  'Lament',
  'Wither',
  'Nightjar',
  'Barrow',
  'Grievance',
  'Duskmire',
  'Cairn',
  'Ashveil',
];

/**
 * A run's name: two words or one, from its seed, the same every time for the
 * same seed. Never a name a computer goes by — a house legend, anyone the
 * tables seat, or one of your own Vestiges, who sit at the throne — so you
 * are never mistaken for someone across the table.
 */
export function runName(seed: string, taken: readonly string[] = []): string {
  const rng = createRng(`${seed}:name`);
  const pick = <T>(list: T[]) => list[Math.floor(rng() * list.length)]!;
  const forbidden = new Set([...CPU_NAMES, ...LEGEND_NAMES, ...taken]);
  for (let i = 0; i < 50; i++) {
    const name = rng() < 1 / 3 ? pick(RUN_SINGLES) : `${pick(RUN_EPITHETS)} ${pick(RUN_NOUNS)}`;
    if (!forbidden.has(name)) return name;
  }
  return `${pick(RUN_EPITHETS)} ${pick(RUN_NOUNS)} ${Math.floor(rng() * 90) + 10}`;
}

export function startRun(seed: string, classId: ClassId, vestiges: VestigeRecord[] = []): RunState {
  const worth = CLASSES[classId].startingWorth;
  return arrive(
    {
      version: 4,
      seed,
      name: runName(
        seed,
        vestiges.map((v) => v.name),
      ),
      classId,
      worth,
      medallions: [],
      map: generateMap(createRng(`${seed}:map`)),
      path: [],
      tier: 0,
      phase: 'map',
      offers: {},
      nodeId: null,
      chosen: null,
      table: null,
      shopOffers: [],
      rewards: [],
      lastRitesUsed: false,
      lastHand: null,
      stats: { tablesWon: 0, handsPlayed: 0, raises: 0, bestWorth: worth, tablesClosed: 0 },
      draws: 0,
      round: 0,
    },
    vestiges,
  );
}

/** The nodes you may choose now. */
export const choices = (run: RunState): MapNode[] => reachable(run.map, run.path);

/**
 * What sitting at a node would take from you: its buy-in (less an ante with
 * Hoard), or, short of that, all but three of your antes. Null for a merchant.
 */
export function entryCost(run: RunState, node: MapNode): number | null {
  if (node.kind === 'merchant' || node.kind === 'event') return null;
  const offer = run.offers[node.id];
  if (offer) return stakeFor(offer, run);
  const { ante, buyIn } = nodeCost(node.tier, node.kind === 'throne' ? 'vestige' : node.archetype!);
  return Math.max(0, buyIn - (levelOf(run.medallions, 'hoard') >= 1 ? ante : 0));
}

/** Whether you can take a node now: any gold buys a seat, if only a short one. */
export const canEnter = (run: RunState, _node: MapNode): boolean => run.worth > 0;

/**
 * Onto the map: every table you could go to next is dealt now, so its players
 * can be read before you choose. Over, if nowhere you can go is somewhere you
 * can afford.
 */
export function arrive(run: RunState, vestiges: VestigeRecord[] = []): RunState {
  const [rng, drawn] = draw({
    ...run,
    phase: 'map',
    nodeId: null,
    chosen: null,
    table: null,
    tier: depthOf(run.map, run.path),
  });
  const offers: Record<string, TableOption> = {};
  for (const node of choices(drawn)) {
    if (node.kind === 'throne')
      offers[node.id] = finaleOption(rng, { classId: run.classId, vestiges, round: run.round });
    if (node.kind === 'table') {
      offers[node.id] = tableOption(rng, {
        tier: node.tier,
        classId: run.classId,
        archetype: node.archetype!,
        id: `${node.id}-r${run.round}`,
      });
    }
  }
  const base: RunState = { ...drawn, offers, round: run.round + 1 };
  return choices(base).some((n) => canEnter(base, n)) ? base : { ...base, phase: 'lost' };
}

/** Take a node: sit down at its table, paying the buy-in, or go to the merchant. */
export function enterNode(run: RunState, nodeId: string): RunState {
  if (run.phase !== 'map') return run;
  const node = choices(run).find((n) => n.id === nodeId);
  if (!node || !canEnter(run, node)) return run;
  if (node.kind === 'merchant') {
    const [rng, next] = draw(run);
    return {
      ...next,
      phase: 'shop',
      tier: node.tier,
      offers: {},
      path: [...next.path, node.id],
      shopOffers: shopOffers(rng, run.classId, run.medallions),
    };
  }
  if (node.kind === 'event') {
    const [rng, next] = draw(run);
    const event = drawEvent(rng, run.seenEvents ?? [], { ...run, tier: node.tier });
    return {
      ...next,
      phase: 'event',
      tier: node.tier,
      offers: {},
      path: [...next.path, node.id],
      event,
      seenEvents: [...(run.seenEvents ?? []), event.id],
    };
  }
  const chosen = run.offers[node.id];
  if (!chosen) return run;
  const table = openTable(chosen, {
    classId: run.classId,
    worth: run.worth,
    medallions: run.medallions,
    lastRitesUsed: run.lastRitesUsed,
  });
  return {
    ...run,
    phase: 'table',
    tier: node.tier,
    nodeId: node.id,
    chosen,
    offers: {},
    table,
    worth: 0,
    lastHand: null,
  };
}

export function startHand(run: RunState, showdown: boolean): RunState {
  if (run.phase !== 'table' || !run.table) return run;
  return { ...run, table: beginHand(run.table, showdown) };
}

export function raiseInHand(run: RunState, seat: PlayerId, size: number, stillPlaying: PlayerId[]): RunState {
  if (!run.table?.hand) return run;
  const table = raiseHand(run.table, seat, size, stillPlaying);
  if (table === run.table) return run;
  const raises = seat === 'seat-1' ? run.stats.raises + 1 : run.stats.raises;
  return { ...run, table, stats: { ...run.stats, raises } };
}

/** Settle the hand just played, and move the run on if the table ended. */
export function endHand(run: RunState, result: HandResult, vestiges: VestigeRecord[] = []): RunState {
  if (!run.table?.hand) return run;
  const [rng, drawn] = draw(run);
  const { table, outcome } = finishHand(run.table, result, rng);
  const seat = you(table);
  const stats = {
    ...drawn.stats,
    handsPlayed: drawn.stats.handsPlayed + 1,
    bestWorth: Math.max(drawn.stats.bestWorth, seat.worth),
  };
  const lastRitesUsed = run.lastRitesUsed || table.spent.includes(`${PLAYER_KEY}:last-rites`);
  let next: RunState = { ...drawn, table, lastHand: outcome, stats, lastRitesUsed };
  if (!outcome.end) return next;

  // The table is over. Your Worth comes off it.
  next = { ...next, worth: seat.worth };
  if (outcome.end.kind === 'broke') return { ...next, phase: 'lost' };
  // Won or lost, a table is over and you go on down: the map never sends you
  // back. A table lost costs its gold and gives no spoils.
  const node = next.nodeId ? nodeById(next.map, next.nodeId) : undefined;
  next = { ...next, path: node ? [...next.path, node.id] : next.path };
  if (outcome.end.kind === 'closed') {
    next = { ...next, stats: { ...next.stats, tablesClosed: stats.tablesClosed + 1 } };
    // The throne is the one table that cannot be passed without winning it.
    return node?.kind === 'throne' ? { ...next, phase: 'lost' } : arrive(next, vestiges);
  }

  // Won.
  next = { ...next, stats: { ...next.stats, tablesWon: next.stats.tablesWon + 1 } };
  if (node?.kind === 'throne') return { ...next, phase: 'won' };
  const [pickRng, after] = draw(next);
  // Everyone who sat against you here: the ones you can loot from.
  const beaten = [...(next.chosen?.lineup ?? []), ...table.seats.flatMap((s) => (s.persona ? [s.persona] : []))];
  const rewards = rewardOffers(pickRng, {
    classId: next.classId,
    loadout: next.medallions,
    reward: next.chosen?.reward ?? 'none',
    beaten,
  });
  return rewards.length > 0 ? { ...after, phase: 'reward', rewards } : arrive({ ...after, rewards: [] }, vestiges);
}

/**
 * Take one of a won table's offers — or none — and go back to the map. A
 * looted Medallion comes at the level its owner held it.
 */
export function claimReward(run: RunState, index: number | null, vestiges: VestigeRecord[] = []): RunState {
  if (run.phase !== 'reward') return run;
  const offer = index === null ? undefined : run.rewards[index];
  let medallions = run.medallions;
  if (offer) {
    medallions = offer.kind === 'loot' ? raiseTo(medallions, offer.id, offer.level) : gain(medallions, offer.id);
  }
  return arrive({ ...run, medallions, rewards: [] }, vestiges);
}

function raiseTo(loadout: Held[], id: MedallionId, level: number): Held[] {
  let next = loadout;
  while (levelOf(next, id) < level) next = gain(next, id);
  return next;
}

export function buyMedallion(run: RunState, id: MedallionId): RunState {
  if (run.phase !== 'shop' || !run.shopOffers.includes(id)) return run;
  const price = medallionPrice(id, run.tier);
  if (run.worth <= price) return run;
  return {
    ...run,
    worth: run.worth - price,
    medallions: gain(run.medallions, id),
    shopOffers: run.shopOffers.filter((o) => o !== id),
  };
}

/** Away from the merchant, back to the map. */
export function leaveShop(run: RunState, vestiges: VestigeRecord[] = []): RunState {
  return run.phase === 'shop' ? arrive(run, vestiges) : run;
}

/** One step of a ? event: its gold and Medallions applied to the run. */
export function actInEvent(run: RunState, action: EventAction): RunState {
  if (run.phase !== 'event' || !run.event) return run;
  const [rng, next] = draw(run);
  const result = actOnEvent(rng, run.event, action, run);
  if (result.event === run.event) return run;
  let medallions = next.medallions;
  if (result.gained) medallions = gain(medallions, result.gained);
  if (result.lost) medallions = medallions.filter((m) => m.id !== result.lost);
  const worth = next.worth + result.gold;
  return {
    ...next,
    event: result.event,
    worth,
    medallions,
    stats: { ...next.stats, bestWorth: Math.max(next.stats.bestWorth, worth) },
  };
}

/** Away from a ? event, once it is over, back to the map. */
export function leaveEvent(run: RunState, vestiges: VestigeRecord[] = []): RunState {
  if (run.phase !== 'event' || !run.event || !eventOver(run.event)) return run;
  return arrive({ ...run, event: null }, vestiges);
}
