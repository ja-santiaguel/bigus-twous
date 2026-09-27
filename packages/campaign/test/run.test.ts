import { describe, expect, it } from 'vitest';
import {
  anteFor,
  arrive,
  buyMedallion,
  canCallReckoning,
  canEnter,
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
  CLASSES,
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
    expect(you(run.table!).worth).toBe(CLASSES.courtier.startingWorth - stake);
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
      const owed = anteFor(ready.table!, seat) * SHOWDOWN_ANTE;
      // Three antes, or death for a seat that cannot pay them.
      if (seat.worth >= owed) expect(paid[id]).toBe(owed);
      else expect(called.table!.hand!.fallen?.map((f) => f.seat)).toContain(id);
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

  it('closes at the last hand if you never win, and sends you on down with no spoils', () => {
    const plain = seated();
    // A purse deep enough to live through the Requiem's three antes, and a
    // tribute it does not reach.
    const start: RunState = {
      ...plain,
      table: {
        ...plain.table!,
        mark: 100_000,
        seats: plain.table!.seats.map((s) => (s.id === PLAYER_SEAT ? { ...s, worth: 2000 } : s)),
      },
    };
    let run = start;
    for (let i = 0; i < 20 && run.phase === 'table'; i++) run = endHand(startHand(run, false), youThird);
    expect(run.lastHand?.end?.kind).toBe('closed');
    expect(run.phase).toBe('map');
    // The table is gone from the run, but kept as it closed, for its end to be told from.
    expect(run.table).toBeNull();
    expect(run.lastTable && you(run.lastTable).worth).toBe(run.worth);
    expect(run.path).toEqual([start.nodeId]);
    expect(run.tier).toBe(run.map.rows[1]![0]!.tier);
    expect(run.medallions).toEqual([]);
    expect(run.worth).toBeGreaterThan(0);
  });

  it('kills a player who cannot pay the ante as the hand opens, and deals on without them', () => {
    let run = seated('ante-death');
    const gone = others[1]!;
    run = {
      ...run,
      table: { ...run.table!, seats: run.table!.seats.map((s) => (s.id === gone ? { ...s, worth: 3 } : s)) },
    };
    const dealt = startHand(run, false);
    expect(dealt.phase).toBe('table');
    const seat = dealt.table!.seats.find((s) => s.id === gone)!;
    expect(seat.broke).toBe(true);
    expect(seat.worth).toBe(0);
    expect(dealt.table!.hand!.pot.contributions[gone]).toBeUndefined();
    const owed = anteFor(
      run.table!,
      run.table!.seats.find((s) => s.id === gone)!,
    );
    expect(dealt.table!.hand!.fallen).toEqual([{ seat: gone, persona: seat.persona, owed, had: 3 }]);
    // Told at the end of the hand it died at.
    const after = endHand(dealt, youFirst);
    expect(after.lastHand!.left.map((l) => l.seat)).toEqual([gone]);
    expect(after.lastHand!.left[0]!.owed).toBe(owed);
  });

  it('ends the run when you cannot pay the ante: you die paying, and no hand is dealt', () => {
    let run = seated('your-death');
    run = {
      ...run,
      table: {
        ...run.table!,
        seats: run.table!.seats.map((s) => (s.id === PLAYER_SEAT ? { ...s, worth: 2 } : s)),
      },
    };
    const dead = startHand(run, false);
    expect(dead.phase).toBe('lost');
    expect(dead.table!.hand).toBeNull();
    expect(dead.lastHand!.end?.kind).toBe('broke');
    expect(dead.lastHand!.left[0]).toMatchObject({ seat: PLAYER_SEAT, had: 2 });
    expect(dead.worth).toBe(0);
  });

  it('spares you once with Last Rites: three antes instead of death at the ante', () => {
    let run = seated('last-rites');
    run = {
      ...run,
      table: {
        ...run.table!,
        seats: run.table!.seats.map((s) =>
          s.id === PLAYER_SEAT ? { ...s, worth: 2, medallions: [{ id: 'last-rites', level: 1 }] } : s,
        ),
      },
    };
    const spared = startHand(run, false);
    expect(spared.phase).toBe('table');
    const ante = anteFor(run.table!, you(run.table!));
    expect(spared.table!.hand!.pot.contributions[PLAYER_SEAT]).toBe(ante);
    expect(you(spared.table!).worth).toBe(3 * ante);
    expect(spared.table!.hand!.spared).toEqual([{ seat: PLAYER_SEAT, amount: 3 * ante - 2 }]);
    expect(spared.lastRitesUsed || spared.table!.spent.includes('you:last-rites')).toBe(true);
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

  it('seats you only if you can pay the buy-in and live through the first ante', () => {
    const run = startRun('afford', 'commoner');
    const node = choices(run)[0]!;
    const offer = run.offers[node.id]!;
    const ante = Math.round(offer.ante * 0.75);
    expect(canEnter({ ...run, worth: offer.buyIn + ante - 1 }, node)).toBe(false);
    expect(enterNode({ ...run, worth: offer.buyIn + ante - 1 }, node.id).phase).toBe('map');
    const seatedAt = enterNode({ ...run, worth: offer.buyIn + ante }, node.id);
    expect(seatedAt.phase).toBe('table');
    expect(seatedAt.table!.stakes.you).toBe(offer.buyIn);
    expect(you(seatedAt.table!).worth).toBe(ante);
  });

  it('ends the run on the map when not even a beggar’s seat can be paid for', () => {
    const run = startRun('no-way-down', 'commoner');
    expect(arrive({ ...run, worth: 1 }).phase).toBe('lost');
  });

  it('leaves a beggar’s seat open when no way down can be paid for: all you can spare, two antes kept', () => {
    const run = startRun('beggar', 'commoner');
    const offers = Object.values(run.offers);
    const cheapest = Math.min(...offers.map((o) => o.buyIn));
    const ante = Math.round(offers[0]!.ante * 0.75);
    // Too poor for any seat at its own price, rich enough for two of your antes and a little.
    const worth = Math.min(cheapest, 2 * ante + 20);
    const poor = arrive({ ...run, worth });
    expect(poor.phase).toBe('map');
    const spared = Object.entries(poor.offers).find(([, o]) => o.mercy);
    expect(spared).toBeDefined();
    const [nodeId, offer] = spared!;
    expect(offer.buyIn).toBe(worth - 2 * ante);
    const node = choices(poor).find((n) => n.id === nodeId)!;
    expect(canEnter(poor, node)).toBe(true);
    const seatedAt = enterNode(poor, nodeId);
    expect(seatedAt.phase).toBe('table');
    expect(you(seatedAt.table!).worth).toBe(2 * ante);
  });

  it('never asks more than three of the table’s antes at a showdown, whatever the ante share', () => {
    const run = startRun('requiem-cap', 'tyrant');
    const seatedAt = enterNode(run, choices(run)[0]!.id);
    const table = seatedAt.table!;
    const seat = you(table);
    // A Tyrant pays half as much again on an ordinary hand…
    expect(anteFor(table, seat)).toBe(Math.round(table.option.ante * 1.5));
    // …but three of the table's antes, not four and a half, at the Requiem.
    expect(anteFor(table, seat, true)).toBe(table.option.ante * SHOWDOWN_ANTE);
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
