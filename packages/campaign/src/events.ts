import { cardValue, createDeck, type Card, type Rng } from '@big-two/engine';
import { CLASSES, type ClassId } from './classes.js';
import { rewardOffers } from './ladder.js';
import { type Held, type MedallionId } from './medallions.js';
import { TIERS } from './tiers.js';

/**
 * The ? events: what waits in the dark between tables.
 *
 * Three, each a short scene with one decision in it and nothing to learn but
 * the choice itself — a wager, a pick, a bargain:
 *
 *   The Ferryman's Wager   a risk. Stake two antes; he turns a card, you call
 *                          the next one higher or lower. Each right call
 *                          doubles the stake, three at most; take it whenever
 *                          you like. One wrong call and it is his.
 *   The Drowned Reliquary  pure profit. Three sealed coffers, light, heavy and
 *                          between: the lighter, the likelier a Medallion; the
 *                          heavier, the more gold. Open one, and see after
 *                          what the others held.
 *   The Tithe-Taker        a loss you can only lessen. He takes a quarter of
 *                          your gold, three of your antes at most. Haggle and he may come down a twentieth
 *                          — each time less likely — or go up a tenth and stop
 *                          listening. Or give him a Medallion instead.
 *
 * Pure, like the run: every step takes the event and returns the next, and
 * every chance is drawn from the generator it is handed, so a saved event
 * resumes exactly.
 */

export type EventId = 'ferryman' | 'reliquary' | 'tithe-taker';

export const EVENT_IDS: EventId[] = ['ferryman', 'reliquary', 'tithe-taker'];

export const EVENT_NAMES: Record<EventId, string> = {
  ferryman: "The Ferryman's Wager",
  reliquary: 'The Drowned Reliquary',
  'tithe-taker': 'The Tithe-Taker',
};

/** The Ferryman's stake, in your antes, and how many calls he will take. */
export const FERRYMAN_STAKE_ANTES = 2;
export const FERRYMAN_CALLS = 3;

export interface FerrymanState {
  id: 'ferryman';
  stake: number;
  /** What rides on the next call: the stake, doubled for each right call. */
  pot: number;
  /** The cards turned so far, the last one showing. Empty until you stake. */
  turned: Card[];
  calls: number;
  /** How it ended: the pot taken, lost on a wrong call, or never staked. */
  over: null | 'taken' | 'lost' | 'declined';
}

export type CofferWeight = 'light' | 'between' | 'heavy';

export interface Coffer {
  weight: CofferWeight;
  /** What is inside, drawn as the scene opens: gold, or a Medallion. */
  holds: { kind: 'gold'; amount: number } | { kind: 'medallion'; id: MedallionId };
}

export interface ReliquaryState {
  id: 'reliquary';
  coffers: Coffer[];
  opened: number | null;
}

/** The Tithe-Taker's cut, in hundredths of your gold. */
export const TITHE_START = 25;
export const TITHE_STEP_DOWN = 5;
export const TITHE_STEP_UP = 10;
/** The chance each haggle brings him down, first to last; there is no sixth. */
export const HAGGLE_CHANCES = [0.7, 0.55, 0.4, 0.25, 0.15];

export interface TitheState {
  id: 'tithe-taker';
  /** His cut now, in hundredths of your gold. */
  rate: number;
  haggles: number;
  /** He has stopped listening: a haggle failed. */
  deaf: boolean;
  /** How the last haggle went, for the scene to say. */
  last: null | 'down' | 'up';
  over: null | { kind: 'paid'; amount: number } | { kind: 'pardoned' } | { kind: 'medallion'; id: MedallionId };
}

export type EventState = FerrymanState | ReliquaryState | TitheState;

export type EventAction =
  | { kind: 'stake' }
  | { kind: 'decline' }
  | { kind: 'call'; higher: boolean }
  | { kind: 'take' }
  | { kind: 'open'; coffer: number }
  | { kind: 'haggle' }
  | { kind: 'pay' }
  | { kind: 'offer'; id: MedallionId };

/** What you carry into an event: the run's gold, build and depth. */
export interface EventPurse {
  worth: number;
  medallions: Held[];
  classId: ClassId;
  tier: number;
}

/** Your ante at this depth: what the events count in. */
export const eventAnte = (purse: EventPurse): number =>
  Math.max(1, Math.round(TIERS[purse.tier]!.ante * CLASSES[purse.classId].anteMultiplier));

/** An event for this node: one not met yet this run, where one is left. */
export function drawEvent(rng: Rng, seen: readonly EventId[], purse: EventPurse): EventState {
  const fresh = EVENT_IDS.filter((id) => !seen.includes(id));
  const pool = fresh.length > 0 ? fresh : EVENT_IDS;
  const id = pool[Math.floor(rng() * pool.length)]!;
  return openEvent(rng, id, purse);
}

export function openEvent(rng: Rng, id: EventId, purse: EventPurse): EventState {
  switch (id) {
    case 'ferryman':
      return {
        id,
        stake: FERRYMAN_STAKE_ANTES * eventAnte(purse),
        pot: 0,
        turned: [],
        calls: 0,
        over: null,
      };
    case 'reliquary':
      return { id, coffers: fillCoffers(rng, purse), opened: null };
    case 'tithe-taker':
      return { id, rate: TITHE_START, haggles: 0, deaf: false, last: null, over: null };
  }
}

/** The coffers' odds of a Medallion, and the gold each holds otherwise, in table antes. */
const COFFERS: { weight: CofferWeight; medallion: number; antes: number }[] = [
  { weight: 'light', medallion: 0.7, antes: 1 },
  { weight: 'between', medallion: 0.4, antes: 3 },
  { weight: 'heavy', medallion: 0.1, antes: 5 },
];

function fillCoffers(rng: Rng, purse: EventPurse): Coffer[] {
  const ante = TIERS[purse.tier]!.ante;
  const taken: MedallionId[] = [];
  return COFFERS.map(({ weight, medallion, antes }) => {
    if (rng() < medallion) {
      // A Medallion your class can carry, as a won table would offer; gold if
      // there is none left to offer.
      const offer = rewardOffers(rng, {
        classId: purse.classId,
        loadout: purse.medallions,
        reward: 'standard',
        beaten: [],
      }).find((o) => !taken.includes(o.id));
      if (offer) {
        taken.push(offer.id);
        return { weight, holds: { kind: 'medallion', id: offer.id } };
      }
    }
    return { weight, holds: { kind: 'gold', amount: antes * ante } };
  });
}

/**
 * How many of your antes his cut may come to, at his opening rate: a
 * quarter of your gold, but never more than three of your antes — so the
 * richer you are the smaller a share he takes, and a good run is not
 * punished for being good. The cap moves with his rate.
 */
export const TITHE_CAP_ANTES = 3;

/** The Tithe-Taker's cut: his rate of your gold, capped at his rate's worth of your antes. */
export const titheOf = (worth: number, rate: number, ante: number): number =>
  Math.min(Math.floor((worth * rate) / 100), Math.round((ante * TITHE_CAP_ANTES * rate) / TITHE_START));

/** The chance the next haggle brings him down, or null if he will not listen. */
export const haggleChance = (event: TitheState): number | null =>
  event.deaf || event.over ? null : (HAGGLE_CHANCES[event.haggles] ?? null);

/**
 * One step of an event. Returns the event and what it did to your purse:
 * gold gained or lost, and a Medallion gained or given up. An action the
 * scene does not allow now leaves everything as it was.
 */
export function actOnEvent(
  rng: Rng,
  event: EventState,
  action: EventAction,
  purse: EventPurse,
): { event: EventState; gold: number; gained?: MedallionId; lost?: MedallionId } {
  const same = { event, gold: 0 };
  switch (event.id) {
    case 'ferryman': {
      if (event.over) return same;
      if (action.kind === 'decline' && event.turned.length === 0)
        return { event: { ...event, over: 'declined' }, gold: 0 };
      if (action.kind === 'stake' && event.turned.length === 0) {
        if (purse.worth <= event.stake) return same;
        const first = turnCard(rng, []);
        return { event: { ...event, pot: event.stake, turned: [first] }, gold: -event.stake };
      }
      if (action.kind === 'call' && event.turned.length > 0 && event.calls < FERRYMAN_CALLS) {
        const showing = event.turned[event.turned.length - 1]!;
        const next = turnCard(rng, event.turned);
        const right = action.higher ? cardValue(next) > cardValue(showing) : cardValue(next) < cardValue(showing);
        const turned = [...event.turned, next];
        if (!right) return { event: { ...event, turned, calls: event.calls + 1, over: 'lost' }, gold: 0 };
        const called = { ...event, turned, calls: event.calls + 1, pot: event.pot * 2 };
        // The last call he will take pays out on its own.
        if (called.calls >= FERRYMAN_CALLS) return { event: { ...called, over: 'taken' }, gold: called.pot };
        return { event: called, gold: 0 };
      }
      if (action.kind === 'take' && event.calls > 0) return { event: { ...event, over: 'taken' }, gold: event.pot };
      return same;
    }
    case 'reliquary': {
      if (action.kind !== 'open' || event.opened !== null) return same;
      const coffer = event.coffers[action.coffer];
      if (!coffer) return same;
      const opened = { ...event, opened: action.coffer };
      return coffer.holds.kind === 'gold'
        ? { event: opened, gold: coffer.holds.amount }
        : { event: opened, gold: 0, gained: coffer.holds.id };
    }
    case 'tithe-taker': {
      if (event.over) return same;
      if (action.kind === 'pay') {
        const amount = titheOf(purse.worth, event.rate, eventAnte(purse));
        return { event: { ...event, over: { kind: 'paid', amount } }, gold: -amount };
      }
      if (action.kind === 'offer' && purse.medallions.some((m) => m.id === action.id)) {
        return { event: { ...event, over: { kind: 'medallion', id: action.id } }, gold: 0, lost: action.id };
      }
      if (action.kind === 'haggle') {
        const chance = haggleChance(event);
        if (chance === null) return same;
        const haggles = event.haggles + 1;
        if (rng() < chance) {
          const rate = Math.max(0, event.rate - TITHE_STEP_DOWN);
          if (rate === 0)
            return { event: { ...event, rate, haggles, last: 'down', over: { kind: 'pardoned' } }, gold: 0 };
          return { event: { ...event, rate, haggles, last: 'down' }, gold: 0 };
        }
        return { event: { ...event, rate: event.rate + TITHE_STEP_UP, haggles, deaf: true, last: 'up' }, gold: 0 };
      }
      return same;
    }
  }
}

/** Whether the scene is over and you may go on down. */
export const eventOver = (event: EventState): boolean =>
  event.id === 'reliquary' ? event.opened !== null : event.over !== null;

/** A card from the deck, not one already turned. */
function turnCard(rng: Rng, turned: readonly Card[]): Card {
  const gone = new Set(turned.map((c) => `${c.rank}${c.suit}`));
  const deck = createDeck().filter((c) => !gone.has(`${c.rank}${c.suit}`));
  return deck[Math.floor(rng() * deck.length)]!;
}
