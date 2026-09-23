import { describe, expect, it } from 'vitest';
import {
  anteFor,
  arrive,
  buyMedallion,
  canCallReckoning,
  choices,
  enterNode,
  claimReward,
  endHand,
  leaveShop,
  phantomOf,
  PLAYER_SEAT,
  raiseInHand,
  recordVictory,
  SEAT_IDS,
  SHOWDOWN_ANTE,
  SWIFT_ANTES,
  CPU_NAMES,
  runName,
  isLastCall,
  startHand,
  startRun,
  you,
  type MapNode,
  type RunState,
  type VestigeRecord,
} from '../src/index.js';

/** A run, driven by hand: the map, a table's hands, and how a table ends. */

const others = SEAT_IDS.filter((id) => id !== PLAYER_SEAT);
const youFirst = { placing: [PLAYER_SEAT, ...others], wentOutWith: {} };
const youLast = { placing: [...others, PLAYER_SEAT], wentOutWith: {} };
const youSecond = { placing: [others[0]!, PLAYER_SEAT, others[1]!, others[2]!], wentOutWith: {} };
const youThird = { placing: [others[0]!, others[1]!, PLAYER_SEAT, others[2]!], wentOutWith: {} };

function seated(seed = 'run-test'): RunState {
  const run = startRun(seed, 'courtier');
  return enterNode(run, choices(run)[0]!.id);
}

/** Plays hands you win, raising as far as you may, until a Reckoning can be called. */
function toTheMark(run: RunState): RunState {
  let next = run;
  for (let i = 0; i < 40 && !canCallReckoning(next.table!); i++) {
    next = startHand(next, false);
    next = raiseInHand(next, PLAYER_SEAT, 1, [...SEAT_IDS]);
    next = raiseInHand(next, PLAYER_SEAT, 1, [...SEAT_IDS]);
    next = endHand(next, youFirst);
    if (next.phase !== 'table') break;
  }
  expect(canCallReckoning(next.table!)).toBe(true);
  expect(next.table!.handsPlayed).toBeLessThan(next.table!.option.hands - 1);
  return next;
}

describe('the descent', () => {
  it('starts on the map, choosing among the first row', () => {
    const run = startRun('map', 'tyrant');
    expect(run.phase).toBe('map');
    expect(choices(run)).toEqual(run.map.rows[0]);
  });

  it('draws the same map from the same seed, and a different one from another', () => {
    expect(startRun('same', 'commoner').map).toEqual(startRun('same', 'commoner').map);
    expect(startRun('same', 'commoner').map).not.toEqual(startRun('other', 'commoner').map);
  });

  it("takes the table's buy-in from everyone as they sit", () => {
    const run = seated();
    const stake = run.table!.stakes.you!;
    expect(stake).toBe(run.chosen!.buyIn);
    // Everyone pays the same.
    for (const paid of Object.values(run.table!.stakes)) expect(paid).toBeLessThanOrEqual(run.chosen!.buyIn);
    expect(you(run.table!).worth).toBe(440 - stake);
    expect(Object.keys(run.table!.stakes)).toHaveLength(4);
  });
});

describe('a table', () => {
  it('moves gold from the last seat to the first, and never makes any', () => {
    const run = seated();
    const before = run.table!.seats.reduce((s, seat) => s + seat.worth, 0);
    const after = endHand(startHand(run, false), youFirst);
    expect(after.table!.seats.reduce((s, seat) => s + seat.worth, 0)).toBe(before);
    expect(after.lastHand!.ledger[PLAYER_SEAT]!.net).toBeGreaterThan(0);
    expect(after.lastHand!.ledger[others[2]!]!.net).toBeLessThan(0);
  });

  it('makes everyone still playing match your raise', () => {
    const run = startHand(seated(), false);
    const raised = raiseInHand(run, PLAYER_SEAT, 0, [...SEAT_IDS]);
    const before = run.table!.hand!.pot.contributions;
    const after = raised.table!.hand!.pot.contributions;
    const raisedBy = after[PLAYER_SEAT]! - before[PLAYER_SEAT]!;
    expect(raisedBy).toBeGreaterThan(0);
    for (const id of others) expect(after[id]! - before[id]!).toBe(raisedBy);
    expect(raised.stats.raises).toBe(1);
  });

  it('holds the Reckoning back until you have played a few hands and hold the tribute', () => {
    const run = seated();
    expect(canCallReckoning(run.table!)).toBe(false);
    const ready = toTheMark(run);
    expect(ready.table!.handsPlayed).toBeGreaterThanOrEqual(ready.table!.option.showdownWait);
    expect(you(ready.table!).worth).toBeGreaterThanOrEqual(ready.table!.mark);
  });

  it('charges the others three antes at a Reckoning and you one, and pays the whole pot', () => {
    const ready = toTheMark(seated());
    const called = startHand(ready, true);
    const paid = called.table!.hand!.pot.contributions;
    expect(called.table!.hand!.reckoning).toBe(true);
    expect(paid[PLAYER_SEAT]).toBe(anteFor(ready.table!, you(ready.table!)));
    for (const id of others) {
      const seat = ready.table!.seats.find((s) => s.id === id)!;
      if (seat.broke) continue;
      expect(paid[id]).toBe(Math.min(seat.worth, anteFor(ready.table!, seat) * SHOWDOWN_ANTE));
    }
    const pot = Object.values(paid).reduce((a, b) => a + b, 0);
    const won = endHand(called, youFirst);
    // First place takes 70% of everything in it, not only what it could match.
    expect(won.lastHand!.ledger[PLAYER_SEAT]!.got).toBeGreaterThanOrEqual(Math.floor(pot * 0.7));
  });

  it('wins the table on a Reckoning won, with a bounty for every hand left unplayed', () => {
    const ready = toTheMark(seated());
    const left = ready.table!.option.hands - ready.table!.handsPlayed - 1;
    const won = endHand(startHand(ready, true), youFirst);
    expect(won.lastHand!.end?.kind).toBe('won');
    expect(won.lastHand!.swift).toBe(SWIFT_ANTES * ready.table!.option.ante * left);
    // A won table offers its Medallions before the road goes on, one row down.
    expect(['reward', 'map']).toContain(won.phase);
    expect(won.path).toEqual([ready.nodeId]);
    const on = won.phase === 'reward' ? claimReward(won, null) : won;
    expect(on.tier).toBe(on.map.rows[1]![0]!.tier);
    expect(choices(on).every((n) => n.row === 1)).toBe(true);
    // The table prize came back with the table: 70% of it, first.
    expect(won.lastHand!.end!.stakes.you!.got).toBeGreaterThan(won.lastHand!.end!.stakes.you!.staked);
  });

  it('keeps you seated after a Reckoning you do not win, and allows no second one', () => {
    const ready = toTheMark(seated());
    const lost = endHand(startHand(ready, true), youSecond);
    expect(lost.phase).toBe('table');
    expect(lost.lastHand!.end).toBeNull();
    expect(lost.table!.reckoned).toBe(true);
    expect(canCallReckoning(lost.table!)).toBe(false);
  });

  it('makes the last hand the Requiem: three antes from everyone', () => {
    let run = seated();
    for (let i = 0; i < 20 && run.phase === 'table' && !isLastCall(run.table!); i++) {
      run = endHand(startHand(run, false), youThird);
    }
    const requiem = startHand(run, false);
    expect(requiem.table!.hand!.showdown).toBe(true);
    expect(requiem.table!.hand!.reckoning).toBeUndefined();
    const seat = you(run.table!);
    expect(requiem.table!.hand!.pot.contributions[PLAYER_SEAT]).toBe(
      Math.min(seat.worth, anteFor(run.table!, seat) * SHOWDOWN_ANTE),
    );
  });

  it('closes at the last hand if you never win, and sends you on down, poorer and with no spoils', () => {
    const start = seated();
    let run = start;
    for (let i = 0; i < 20 && run.phase === 'table'; i++) run = endHand(startHand(run, false), youThird);
    expect(run.lastHand?.end?.kind).toBe('closed');
    expect(run.phase).toBe('map');
    expect(run.path).toEqual([start.nodeId]);
    expect(run.tier).toBe(run.map.rows[1]![0]!.tier);
    expect(run.medallions).toEqual([]);
    expect(run.worth).toBeGreaterThan(0);
    expect(run.worth).toBeLessThan(400);
  });

  it('ends the run when you go broke', () => {
    let run = seated('broke');
    // A thin purse, so a few last places empty it inside one short table.
    run = {
      ...run,
      table: { ...run.table!, seats: run.table!.seats.map((s) => (s.id === PLAYER_SEAT ? { ...s, worth: 40 } : s)) },
    };
    for (let i = 0; i < 200 && run.phase === 'table'; i++) {
      run = startHand(run, false);
      run = raiseInHand(run, others[0]!, 0, [...SEAT_IDS]);
      run = endHand(run, youLast);
    }
    expect(run.phase).toBe('lost');
  });

  it('leaves a broke seat empty for the rest of the table, dealt no more hands', () => {
    let run = seated('bust');
    const gone = others[2]!;
    // A seat with a coin left, last in the hand: broke.
    run = {
      ...run,
      table: { ...run.table!, seats: run.table!.seats.map((s) => (s.id === gone ? { ...s, worth: 1 } : s)) },
    };
    run = endHand(startHand(run, false), youFirst);
    const table = run.table!;
    const seat = table.seats.find((s) => s.id === gone)!;
    expect(seat.broke).toBe(true);
    expect(seat.worth).toBe(0);
    expect(run.lastHand!.left.map((l) => l.seat)).toEqual([gone]);
    expect(run.lastHand!.joined).toEqual([]);
    // The next hand is dealt to the three still in.
    const next = startHand(run, false);
    expect(Object.keys(next.table!.hand!.pot.contributions).sort()).toEqual(
      SEAT_IDS.filter((id) => id !== gone).sort(),
    );
  });

  it('is won when everyone else is broke', () => {
    let run = seated('last-standing');
    run = {
      ...run,
      table: {
        ...run.table!,
        seats: run.table!.seats.map((s) => (s.id === PLAYER_SEAT ? s : { ...s, worth: 1 })),
      },
    };
    for (let i = 0; i < 6 && run.phase === 'table'; i++) {
      const still = run.table!.seats.filter((s) => !s.broke).map((s) => s.id);
      run = endHand(startHand(run, false), {
        placing: [PLAYER_SEAT, ...still.filter((id) => id !== PLAYER_SEAT)],
        wentOutWith: {},
      });
    }
    expect(run.lastHand!.end?.kind).toBe('won');
    expect(run.lastHand!.left.length).toBeGreaterThan(0);
  });
});

describe('the Bone Merchant', () => {
  it('sells Medallions for gold, then goes back to the map below it', () => {
    const base = startRun('merchant', 'commoner');
    const below = base.map.rows[2]![0]!;
    const merchant: MapNode = { id: 'm', row: 1, tier: 0, col: 0, kind: 'merchant', links: [below.id] };
    const first = { ...base.map.rows[0]![0]!, links: ['m'] };
    const map = { rows: base.map.rows.map((row, i) => (i === 0 ? [first] : i === 1 ? [merchant] : row)) };
    const run = arrive({ ...base, map, path: [first.id], worth: 900 });
    const shop = enterNode(run, 'm');
    expect(shop.phase).toBe('shop');
    expect(shop.shopOffers.length).toBeGreaterThan(0);
    const bought = buyMedallion(shop, shop.shopOffers[0]!);
    expect(bought.medallions.map((m) => m.id)).toContain(shop.shopOffers[0]);
    expect(bought.worth).toBeLessThan(shop.worth);
    const next = leaveShop(bought);
    expect(next.phase).toBe('map');
    expect(next.path).toEqual([first.id, 'm']);
    expect(choices(next).map((n) => n.id)).toEqual([below.id]);
  });
});

/** Straight to the throne, with gold earned on the way down. */
function seatedThrone(vestiges: VestigeRecord[]) {
  const run = startRun('finale-seat', 'commoner');
  const above = run.map.rows.at(-2)![0]!;
  return enterNode(arrive({ ...run, worth: 5000, path: [above.id] }, vestiges), 'throne').table!;
}

describe('the throne', () => {
  it('seats house legends until there are Vestiges, and records a winning run as one', () => {
    const table = seatedThrone([]);
    expect(table.option.archetype).toBe('vestige');
    expect(table.option.lineup.every((p) => p.key.startsWith('legend:'))).toBe(true);

    const phantom = phantomOf(
      { seed: 'finale', classId: 'tyrant', medallions: [], raises: 8, handsPlayed: 10 },
      0,
      '2026-09-21',
    );
    expect(phantom.temperament).toBe('reckless');
    const full = [phantom, { ...phantom, key: 'v2' }, { ...phantom, key: 'v3' }];
    const withVestiges = { ...seatedThrone(full), departed: ['v2'] };
    const next = recordVictory(full, withVestiges, { ...phantom, key: 'new' });
    expect(next.map((v) => v.key)).toEqual([phantom.key, 'new', 'v3']);
  });

  it('ends the run won when you take it', () => {
    const table = seatedThrone([]);
    const run = { ...startRun('finale-seat', 'commoner'), phase: 'table' as const, table, nodeId: 'throne' };
    let next = startHand({ ...run, table: { ...table, handsPlayed: table.option.hands - 1 } }, false);
    next = endHand(next, youFirst);
    expect(next.phase).toBe('won');
  });
});

describe('winning a table', () => {
  it('is won by coming to the last hand holding the tribute, before that hand is dealt', () => {
    let run = seated('tribute');
    const t = run.table!;
    // Holding the tribute, one hand from the end.
    run = {
      ...run,
      table: {
        ...t,
        handsPlayed: t.option.hands - 2,
        seats: t.seats.map((s) => (s.id === PLAYER_SEAT ? { ...s, worth: t.mark + 500 } : s)),
      },
    };
    const after = endHand(startHand(run, false), youSecond);
    expect(after.lastHand!.end?.kind).toBe('won');
  });
});

describe('buying in', () => {
  it('deals every open table on arrival, so its players are known before choosing', () => {
    const run = startRun('dealt', 'commoner');
    for (const node of choices(run)) expect(run.offers[node.id]?.lineup).toHaveLength(3);
  });

  it('sits you short when you cannot cover the buy-in: all but three antes in', () => {
    const run = startRun('afford', 'commoner');
    const node = choices(run)[0]!;
    const offer = run.offers[node.id]!;
    const ante = Math.round(offer.ante * 0.75);
    const short = enterNode({ ...run, worth: offer.buyIn + ante }, node.id);
    expect(short.phase).toBe('table');
    expect(short.table!.stakes.you).toBe(offer.buyIn - 2 * ante);
    expect(you(short.table!).worth).toBe(3 * ante);
  });

  it('seats nobody with no gold at all', () => {
    const run = startRun('afford', 'commoner');
    expect(enterNode({ ...run, worth: 0 }, choices(run)[0]!.id).phase).toBe('map');
  });
});

describe('rewards', () => {
  it('lets you take one Medallion a won table offers, then goes back to the map', () => {
    let won = endHand(startHand(toTheMark(seated('reward')), true), youFirst);
    if (won.phase !== 'reward')
      won = { ...won, phase: 'reward', rewards: [{ kind: 'new', id: 'precedence', level: 1 }] };
    const offer = won.rewards[0]!;
    const next = claimReward(won, 0);
    expect(next.phase).toBe('map');
    expect(next.medallions.find((m) => m.id === offer.id)?.level).toBe(offer.level);
  });
});

describe('a run name', () => {
  it('is two words or one, and never a name a computer goes by, nor a Vestige of yours', () => {
    const names = Array.from({ length: 500 }, (_, n) => runName(`name-${n}`, ['Vesper']));
    for (const name of names) {
      expect(CPU_NAMES).not.toContain(name);
      expect(name).not.toBe('Vesper');
    }
    expect(names.some((n) => !n.includes(' '))).toBe(true);
    expect(names.some((n) => n.split(' ').length === 2)).toBe(true);
  });
});
