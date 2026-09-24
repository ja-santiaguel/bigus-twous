import type { ComboType, PlayerId, Rng } from '@big-two/engine';
import { anteShareOf, CLASSES, type ClassId } from './classes.js';
import {
  applySettlement,
  HAND_WEIGHTS,
  openPot,
  raise as matchedRaise,
  settlePot,
  STAKE_WEIGHTS,
  type HandPot,
} from './economy.js';
import { levelOf, type Held, type MedallionId } from './medallions.js';
import { passiveCost } from './passives.js';
import type { Persona } from './personas.js';
import { SHOWDOWN_ANTE, type Archetype } from './tiers.js';

/**
 * One campaign table, from sitting down to leaving it.
 *
 * The cards are played by a session like any other table; this is the gold
 * around them. A hand opens with the ante (three antes at the Requiem, and for the others at a Reckoning), takes
 * the price of any class play made in it, and is settled from the finishing
 * order when it ends. A seat that goes broke is out: its chair stays empty
 * for the rest of the table, and it is dealt no more hands. The table ends
 * when you win it — by holding the tribute at the last hand, by winning a
 * Reckoning or the Requiem, or when everyone else is broke — when you go broke
 * yourself, or when its last hand is played without winning.
 *
 * The two showdowns:
 *   Reckoning  called by you, early, once you hold the tribute: the others
 *              ante three times, you ante once and play for the whole pot.
 *              Finish first and the table is yours, with a bounty for every
 *              hand left unplayed; fail and the table goes on, the tribute
 *              still yours to hold to the end. Once a table: the reward for
 *              earning the tribute early.
 *   Requiem      the last hand, for everyone: three antes each, first place
 *              wins the table.
 */

export const SEAT_IDS: PlayerId[] = ['seat-1', 'seat-2', 'seat-3', 'seat-4'];
/** Your seat. Fixed in the campaign, so a save never has to say where you sat. */
export const PLAYER_SEAT: PlayerId = 'seat-1';
/** Your key in stake and history records, which outlive any one seating. */
export const PLAYER_KEY = 'you';

/** A table on offer: who is there, what it costs and what it pays. */
export interface TableOption {
  id: string;
  tier: number;
  archetype: Archetype;
  /** The ante before any class multiplier. */
  ante: number;
  /** What a seat here costs: the same for everyone, paid into the table's prize. */
  buyIn: number;
  /** The Mark: how many of your antes you must gain here before you may call a Reckoning. */
  markAntes: number;
  /** How many hands the table lasts; the last is always the Requiem. */
  hands: number;
  /** Hands you must play before you may call a Reckoning. */
  showdownWait: number;
  reward: 'none' | 'standard' | 'elite';
  /** Harder than its room, and paid for accordingly. */
  elite: boolean;
  /** The three computers seated when you arrive. */
  lineup: Persona[];
  /** Kept for saves made when a broke seat was filled: no one sits down now. */
  rail: Persona[];
}

export interface TableSeat {
  id: PlayerId;
  /** Null for you. */
  persona: Persona | null;
  classId: ClassId;
  worth: number;
  medallions: Held[];
  /** Broke: out of the table, its chair empty, dealt no more hands. */
  broke?: boolean;
}

export interface HandState {
  pot: HandPot;
  /** A showdown: the Requiem, or a Reckoning. */
  showdown: boolean;
  /** Called early by you: the others ante three times, you once. */
  reckoning?: boolean;
}

export interface TableState {
  option: TableOption;
  /** The Worth that earns the right to call a Reckoning: where you sat down, plus the Mark. */
  mark: number;
  seats: TableSeat[];
  /** Each sitting's Table Stake, by persona key (yours is PLAYER_KEY). */
  stakes: Record<string, number>;
  /** Persona keys of the players who went broke here, in the order they left. */
  departed: string[];
  /** Unused: kept so older saves load. No one takes a broke seat's chair. */
  rail: Persona[];
  handsPlayed: number;
  /** A Reckoning was called here and lost: none can be called again at this table. */
  reckoned?: boolean;
  hand: HandState | null;
  /** Numbering for replacements made up when the rail runs dry. */
  spawned: number;
  /**
   * Once-only Medallions already used, as `key:medallion`: Iron Stomach once
   * a table, and Last Rites once a run (yours arrives here already spent if
   * it was used at an earlier table).
   */
  spent: string[];
}

export const keyOf = (seat: TableSeat): string => seat.persona?.key ?? PLAYER_KEY;

/** The seats still in the table: everyone not broke. */
export const inPlay = (table: TableState): TableSeat[] => table.seats.filter((s) => !s.broke);

/** Antes paid to you, from the house, for each hand a won Reckoning leaves unplayed. */
export const SWIFT_ANTES = 1;

/**
 * The tribute: the gold you must win at a table. Counted halfway between the
 * table's own ante and yours: in your ante alone, a small-ante class found it
 * cheap; in the table's alone, a big-ante class — whose wins carry its own
 * large antes — did. Playtested to even the three (src/dev/playtest.ts).
 */
export const tributeOf = (option: { markAntes: number; ante: number }, classId: ClassId): number =>
  Math.round(option.markAntes * option.ante * ((1 + CLASSES[classId].anteMultiplier) / 2));

const holds = (medallions: readonly Held[], id: MedallionId): boolean => levelOf(medallions, id) >= 1;

/** What a seat here costs someone carrying these Medallions: Hoard takes an ante off. */
export const buyInFor = (option: TableOption, medallions: readonly Held[] = []): number =>
  Math.max(0, option.buyIn - (holds(medallions, 'hoard') ? option.ante : 0));

/** Antes you always keep back from a buy-in, so you can play the hands you paid to sit at. */
export const SHORT_SEAT_ANTES = 3;

/**
 * What you actually put in to sit: the buy-in, or — short of it — all but
 * three of your antes. A short seat plays the whole table, but the table
 * prize pays it only from the part it paid for (the prize is layered like any
 * pot, so a seat can never win more from another than it put in itself).
 */
export function stakeFor(
  option: TableOption,
  you: { classId: ClassId; worth: number; medallions: readonly Held[] },
): number {
  const ante = Math.max(1, Math.round(option.ante * anteShareOf(you.classId, you.medallions)));
  return Math.max(0, Math.min(buyInFor(option, you.medallions), you.worth - SHORT_SEAT_ANTES * ante));
}

/** Whether you would sit short here: unable to cover the whole buy-in. */
export const isShort = (option: TableOption, you: { classId: ClassId; worth: number; medallions: readonly Held[] }) =>
  stakeFor(option, you) < buyInFor(option, you.medallions);

/** Whether you can sit at all: any gold at all will buy a short seat. */
export const canAfford = (_option: TableOption, worth: number): boolean => worth > 0;

/** Sit down: everyone pays the table's buy-in into its prize. */
export function openTable(
  option: TableOption,
  you: { classId: ClassId; worth: number; medallions: Held[]; lastRitesUsed?: boolean },
): TableState {
  const yourStake = stakeFor(option, you);
  const stakes: Record<string, number> = { [PLAYER_KEY]: yourStake };
  const seats: TableSeat[] = [
    {
      id: PLAYER_SEAT,
      persona: null,
      classId: you.classId,
      worth: you.worth - yourStake,
      medallions: you.medallions,
    },
    ...option.lineup.map((persona, i) => seatPersona(option, SEAT_IDS[i + 1]!, persona, stakes)),
  ];
  const table: TableState = {
    option,
    mark: 0,
    seats,
    stakes,
    departed: [],
    rail: [...option.rail],
    handsPlayed: 0,
    hand: null,
    spawned: 0,
    spent: you.lastRitesUsed ? [`${PLAYER_KEY}:last-rites`] : [],
  };
  return { ...table, mark: seats[0]!.worth + tributeOf(option, you.classId) };
}

function seatPersona(option: TableOption, id: PlayerId, persona: Persona, stakes: Record<string, number>): TableSeat {
  // Someone who cannot cover the buy-in puts in all but a coin: they sit down desperate.
  const stake = Math.min(buyInFor(option, persona.medallions), Math.max(0, persona.worth - 1));
  stakes[persona.key] = stake;
  return {
    id,
    persona,
    classId: persona.classId,
    worth: persona.worth - stake,
    medallions: persona.medallions,
  };
}

export function seatById(table: TableState, id: PlayerId): TableSeat {
  const seat = table.seats.find((s) => s.id === id);
  if (!seat) throw new Error(`No seat ${id} at this table`);
  return seat;
}

export const you = (table: TableState): TableSeat => seatById(table, PLAYER_SEAT);

/** A seat's ante for one hand. */
export function anteFor(table: TableState, seat: TableSeat, showdown = false): number {
  const base = table.option.ante * anteShareOf(seat.classId, seat.medallions);
  // Ferryman's Coin: two antes where three are asked.
  const times = showdown ? SHOWDOWN_ANTE - (holds(seat.medallions, 'ferrymans-coin') ? 1 : 0) : 1;
  return Math.max(1, Math.round(base * times));
}

/** The raises a seat may make, in gold, smallest first. Steps are in the seat's own (ordinary) ante. */
export function raiseSizes(table: TableState, seat: TableSeat): number[] {
  const steps = CLASSES[seat.classId].raiseSteps;
  const ante = anteFor(table, seat);
  return steps.map((step) => step * ante);
}

/** Raises a seat has left this hand. */
export function raisesLeft(table: TableState, seat: TableSeat): number {
  return CLASSES[seat.classId].raisesPerHand - (table.hand?.pot.raises[seat.id] ?? 0);
}

/** The next hand is the table's last, and so the Requiem. */
export const isLastCall = (table: TableState): boolean => table.handsPlayed >= table.option.hands - 1;

/** Whether you may call a Reckoning for the next hand: holding the tribute, once a table, before the Requiem. */
export function canCallReckoning(table: TableState): boolean {
  return (
    table.hand === null &&
    !table.reckoned &&
    !isLastCall(table) &&
    table.handsPlayed >= table.option.showdownWait &&
    you(table).worth >= table.mark
  );
}

/** The bounty a Reckoning won now would pay: an ante for each hand it leaves unplayed. */
export const swiftBounty = (table: TableState): number =>
  SWIFT_ANTES * table.option.ante * Math.max(0, table.option.hands - table.handsPlayed - 1);

/** What a class play costs this seat now, in gold: its class's price in its own antes. */
export function playCost(table: TableState, seat: TableSeat): number {
  return Math.ceil(passiveCost(seat.classId, seat.medallions) * anteFor(table, seat));
}

/** Whether a seat can pay for a class play from what it has not already put in this hand. */
export function canPayForPlay(table: TableState, seat: TableSeat): boolean {
  const cost = playCost(table, seat);
  if (cost === 0) return true;
  const hand = table.hand;
  const free = seat.worth - (hand?.pot.contributions[seat.id] ?? 0);
  return hand !== null && free >= cost;
}

/**
 * A class play's price, paid into the hand's pot — where the rest of the table
 * can win it back. Refused (the table unchanged) if the seat cannot pay.
 */
export function payForPlay(table: TableState, seatId: PlayerId): TableState {
  const hand = table.hand;
  const seat = seatById(table, seatId);
  if (!hand || !canPayForPlay(table, seat)) return table;
  const cost = playCost(table, seat);
  if (cost === 0) return table;
  const contributions = { ...hand.pot.contributions, [seatId]: (hand.pot.contributions[seatId] ?? 0) + cost };
  return { ...table, hand: { ...hand, pot: { ...hand.pot, contributions } } };
}

/** Worth by seat, for the economy's functions. */
export const worthBySeat = (table: TableState): Record<PlayerId, number> =>
  Object.fromEntries(table.seats.map((s) => [s.id, s.worth]));

/**
 * Open a hand, for the seats still in the table. `reckoning` is your call; the
 * last hand is the Requiem regardless.
 */
export function beginHand(table: TableState, reckoning: boolean): TableState {
  if (table.hand) throw new Error('A hand is already open');
  const requiem = isLastCall(table);
  if (reckoning && !requiem && !canCallReckoning(table)) throw new Error('Not allowed to call a Reckoning now');
  const called = reckoning && !requiem;
  const seats = inPlay(table);
  // At a Reckoning the others ante three times and you once; at the Requiem,
  // everyone three times.
  const antes = Object.fromEntries(
    seats.map((s) => [s.id, anteFor(table, s, requiem || (called && s.id !== PLAYER_SEAT))]),
  );
  const worth = Object.fromEntries(seats.map((s) => [s.id, s.worth]));
  return {
    ...table,
    hand: { pot: openPot(worth, antes), showdown: requiem || called, ...(called ? { reckoning: true } : {}) },
  };
}

/**
 * A Reckoning's pot, paid whole by placement — 70/25/5/0 of everything in it —
 * rather than layered by what each seat put in: you ante once and play for
 * all of it. That is what calling one early is for.
 */
function wholePot(paid: Record<PlayerId, number>, placing: PlayerId[]): Record<PlayerId, number> {
  const total = Object.values(paid).reduce((sum, n) => sum + n, 0);
  const out: Record<PlayerId, number> = {};
  for (const id of Object.keys(paid)) out[id] = 0;
  let given = 0;
  placing.forEach((id, i) => {
    const share = Math.floor((total * (HAND_WEIGHTS[i] ?? 0)) / 100);
    out[id] = (out[id] ?? 0) + share;
    given += share;
  });
  if (placing[0] !== undefined) out[placing[0]] = (out[placing[0]] ?? 0) + (total - given);
  return out;
}

/**
 * A raise, matched by every seat still holding cards. `size` is an index into
 * `raiseSizes`. Refused (returns the table unchanged) when the seat has no
 * raises left, is all-in, or cannot cover the size.
 */
export function raiseHand(table: TableState, seatId: PlayerId, size: number, stillPlaying: PlayerId[]): TableState {
  const hand = table.hand;
  if (!hand) return table;
  const seat = seatById(table, seatId);
  const amount = raiseSizes(table, seat)[size];
  if (amount === undefined || raisesLeft(table, seat) <= 0 || hand.pot.allIn.includes(seatId)) return table;
  if (seat.worth - (hand.pot.contributions[seatId] ?? 0) < amount) return table;
  return { ...table, hand: { ...hand, pot: matchedRaise(hand.pot, worthBySeat(table), seatId, amount, stillPlaying) } };
}

export interface HandResult {
  /** Every seat, best first: the finishing order, the seat left holding cards last. */
  placing: PlayerId[];
  /** The kind of combo each seat went out on. */
  wentOutWith: Partial<Record<PlayerId, ComboType>>;
}

export interface HandOutcome {
  /** Where each seat finished, best first. */
  placing: PlayerId[];
  /** What each seat put in, took back, and the difference. */
  ledger: Record<PlayerId, { paid: number; got: number; net: number }>;
  showdown: boolean;
  /** Any-class Medallions that moved gold this hand, and how much. */
  effects: { seat: PlayerId; medallion: MedallionId; amount: number }[];
  /** Who went broke and is out. */
  left: { seat: PlayerId; persona: Persona | null }[];
  /** Always empty: no one takes a broke seat's chair. Kept for older saves. */
  joined: { seat: PlayerId; persona: Persona }[];
  /** This hand was a Reckoning you called. */
  reckoning?: boolean;
  /** The bounty a won Reckoning paid, for the hands it left unplayed. */
  swift?: number;
  /** Set when the table is over. */
  end: null | { kind: 'won' | 'closed' | 'broke'; stakes: Record<string, { staked: number; got: number }> };
}

/** Settle a hand and move the table on: who goes broke, and the end of the table. */
export function finishHand(
  table: TableState,
  result: HandResult,
  _rng?: Rng,
): { table: TableState; outcome: HandOutcome } {
  const hand = table.hand;
  if (!hand) throw new Error('No hand is open');
  const paid = { ...hand.pot.contributions };
  const payout = hand.reckoning ? wholePot(paid, result.placing) : settlePot(paid, result.placing, HAND_WEIGHTS);
  const worth = applySettlement(Object.fromEntries(table.seats.map((s) => [s.id, s.worth])), paid, payout);
  const { effects, spent } = medallionEffects(table, result.placing, paid, worth);

  const ledger: HandOutcome['ledger'] = {};
  for (const seat of table.seats) {
    const put = paid[seat.id] ?? 0;
    const got = (worth[seat.id] ?? 0) - (seat.worth - put);
    ledger[seat.id] = { paid: put, got, net: got - put };
  }
  const seats = table.seats.map((seat) => ({ ...seat, worth: Math.max(0, worth[seat.id] ?? 0) }));

  let next: TableState = { ...table, seats, spent, hand: null, handsPlayed: table.handsPlayed + 1 };
  const outcome: HandOutcome = {
    placing: result.placing,
    ledger,
    showdown: hand.showdown,
    effects,
    left: [],
    joined: [],
    end: null,
    ...(hand.reckoning ? { reckoning: true } : {}),
  };

  // Broke seats leave. You going broke ends the table, and the run.
  if (you(next).worth <= 0) {
    outcome.left.push({ seat: PLAYER_SEAT, persona: null });
    next = { ...next, departed: [...next.departed, PLAYER_KEY] };
    outcome.end = { kind: 'broke', stakes: settleStakes(next, false).record };
    return { table: next, outcome };
  }
  // Broke seats are out: their chairs stay empty for the rest of the table.
  for (const seat of next.seats) {
    if (seat.persona === null || seat.broke || seat.worth > 0) continue;
    outcome.left.push({ seat: seat.id, persona: seat.persona });
    next = {
      ...next,
      departed: [...next.departed, seat.persona.key],
      seats: next.seats.map((s) => (s.id === seat.id ? { ...s, broke: true, worth: 0 } : s)),
    };
  }

  // A Reckoning won pays a bounty for every hand it leaves unplayed; one lost
  // is spent: there is one to a table.
  const wonShowdown = hand.showdown && result.placing[0] === PLAYER_SEAT;
  if (hand.reckoning && wonShowdown) {
    const bounty = SWIFT_ANTES * next.option.ante * Math.max(0, next.option.hands - next.handsPlayed);
    outcome.swift = bounty;
    next = { ...next, seats: next.seats.map((s) => (s.id === PLAYER_SEAT ? { ...s, worth: s.worth + bounty } : s)) };
  }
  if (hand.reckoning && !wonShowdown) next = { ...next, reckoned: true };

  // A table is won by coming to its last hand holding the tribute — yours
  // before the Requiem is dealt — by finishing first in a Reckoning or the
  // Requiem, or by outlasting everyone else.
  const requiem = hand.showdown && !hand.reckoning;
  const lastHand = requiem && next.handsPlayed >= next.option.hands;
  const paidTribute = !hand.showdown && next.handsPlayed >= next.option.hands - 1 && you(next).worth >= next.mark;
  const alone = inPlay(next).every((s) => s.id === PLAYER_SEAT);
  const won = wonShowdown || paidTribute || alone;
  if (won || lastHand) {
    const settled = settleStakes(next, won);
    next = { ...next, seats: settled.seats };
    outcome.end = { kind: won ? 'won' : 'closed', stakes: settled.record };
  }
  return { table: next, outcome };
}

/**
 * The any-class Medallions that act once a hand is settled, applied to the
 * settled Worth in place: Tithe (the winner takes an ante from every other
 * seat), Iron Stomach (half back for finishing last, once a table) and Last
 * Rites (three antes instead of nothing, once a run).
 */
function medallionEffects(
  table: TableState,
  placing: PlayerId[],
  paid: Record<PlayerId, number>,
  worth: Record<PlayerId, number>,
): { effects: HandOutcome['effects']; spent: string[] } {
  const effects: HandOutcome['effects'] = [];
  const spent = [...table.spent];
  const seat = (id: PlayerId | undefined) => table.seats.find((s) => s.id === id);

  const first = seat(placing[0]);
  if (first && holds(first.medallions, 'tithe')) {
    let taken = 0;
    for (const other of inPlay(table)) {
      if (other.id === first.id) continue;
      const amount = Math.min(anteFor(table, other), Math.max(0, worth[other.id] ?? 0));
      worth[other.id] = (worth[other.id] ?? 0) - amount;
      taken += amount;
    }
    worth[first.id] = (worth[first.id] ?? 0) + taken;
    if (taken > 0) effects.push({ seat: first.id, medallion: 'tithe', amount: taken });
  }

  // Beggar's Cup: third place is paid back what it anted.
  const third = placing.length >= 3 ? seat(placing[2]) : undefined;
  if (third && holds(third.medallions, 'beggars-cup')) {
    const ante = Math.min(paid[third.id] ?? 0, anteFor(table, third, table.hand?.showdown ?? false));
    const got = (worth[third.id] ?? 0) - (third.worth - (paid[third.id] ?? 0));
    const back = Math.max(0, ante - got);
    if (back > 0) {
      worth[third.id] = (worth[third.id] ?? 0) + back;
      effects.push({ seat: third.id, medallion: 'beggars-cup', amount: back });
    }
  }

  const last = seat(placing[placing.length - 1]);
  if (last && holds(last.medallions, 'iron-stomach') && !spent.includes(`${keyOf(last)}:iron-stomach`)) {
    const back = Math.floor((paid[last.id] ?? 0) / 2);
    worth[last.id] = (worth[last.id] ?? 0) + back;
    spent.push(`${keyOf(last)}:iron-stomach`);
    if (back > 0) effects.push({ seat: last.id, medallion: 'iron-stomach', amount: back });
  }

  for (const s of inPlay(table)) {
    if ((worth[s.id] ?? 0) > 0 || !holds(s.medallions, 'last-rites')) continue;
    if (spent.includes(`${keyOf(s)}:last-rites`)) continue;
    const left = 3 * anteFor(table, s);
    worth[s.id] = left;
    spent.push(`${keyOf(s)}:last-rites`);
    effects.push({ seat: s.id, medallion: 'last-rites', amount: left });
  }
  return { effects, spent };
}

/**
 * Settle the table prize (DESIGN_SPEC 4): 70/25/5/0 by standing — last gets nothing. If you
 * won the table you stand first; everyone else seated stands by Worth; the
 * players who went broke stand last, the latest to leave highest, and share
 * nothing (they are gone).
 */
export function settleStakes(
  table: TableState,
  youWon: boolean,
): { seats: TableSeat[]; record: Record<string, { staked: number; got: number }> } {
  const seated = inPlay(table).sort((a, b) => {
    if (youWon && a.id === PLAYER_SEAT) return -1;
    if (youWon && b.id === PLAYER_SEAT) return 1;
    return b.worth - a.worth;
  });
  const gone = table.departed.filter((key) => !inPlay(table).some((s) => keyOf(s) === key)).reverse();
  const placing = [...seated.map(keyOf), ...gone];
  const weights = [...STAKE_WEIGHTS.slice(0, seated.length)];
  const payout = settlePot(table.stakes, placing, weights);
  const record: Record<string, { staked: number; got: number }> = {};
  for (const [key, staked] of Object.entries(table.stakes)) record[key] = { staked, got: payout[key] ?? 0 };
  const seats = table.seats.map((seat) => ({ ...seat, worth: seat.worth + (payout[keyOf(seat)] ?? 0) }));
  return { seats, record };
}
