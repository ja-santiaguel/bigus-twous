import { describe, expect, it } from 'vitest';
import { cardValue, createRng } from '@big-two/engine';
import {
  actInEvent,
  actOnEvent,
  choices,
  enterNode,
  eventOver,
  FERRYMAN_CALLS,
  leaveEvent,
  openEvent,
  startRun,
  TITHE_CAP_ANTES,
  TITHE_START,
  titheOf,
  eventAnte,
  type EventPurse,
  type FerrymanState,
  type RunState,
  type TitheState,
} from '../src/index.js';

const purse: EventPurse = { worth: 1000, medallions: [], classId: 'courtier', tier: 1 };

describe("the Ferryman's Wager", () => {
  it('takes the stake, doubles it for each right call, and pays out on the last', () => {
    let event = openEvent(createRng('f'), 'ferryman', purse) as FerrymanState;
    const staked = actOnEvent(createRng('f1'), event, { kind: 'stake' }, purse);
    expect(staked.gold).toBe(-event.stake);
    event = staked.event as FerrymanState;
    let paid = 0;
    for (let i = 0; i < 10 && !event.over; i++) {
      // Call with the odds: higher off a low card, lower off a high one.
      const showing = event.turned.at(-1)!;
      const step = actOnEvent(createRng(`call${i}`), event, { kind: 'call', higher: cardValue(showing) < 26 }, purse);
      event = step.event as FerrymanState;
      paid += step.gold;
    }
    expect(event.over === 'taken' || event.over === 'lost').toBe(true);
    if (event.over === 'taken') expect(paid).toBe(event.stake * 2 ** FERRYMAN_CALLS);
    else expect(paid).toBe(0);
  });

  it('pays the pot when you take it, and turns no card twice', () => {
    const start = actOnEvent(createRng('g'), openEvent(createRng('g'), 'ferryman', purse), { kind: 'stake' }, purse)
      .event as FerrymanState;
    let event: FerrymanState | null = null;
    for (let seed = 0; seed < 50 && !event; seed++) {
      const higher = cardValue(start.turned[0]!) < 26;
      const step = actOnEvent(createRng(`h${seed}`), start, { kind: 'call', higher }, purse).event as FerrymanState;
      if (step.over !== 'lost') event = step;
    }
    expect(event).not.toBeNull();
    const turned = event!.turned.map((c) => `${c.rank}${c.suit}`);
    expect(new Set(turned).size).toBe(turned.length);
    const taken = actOnEvent(createRng('t'), event!, { kind: 'take' }, purse);
    expect(taken.gold).toBe(event!.stake * 2);
    expect(eventOver(taken.event)).toBe(true);
  });

  it('can be walked past', () => {
    const declined = actOnEvent(
      createRng('d'),
      openEvent(createRng('d'), 'ferryman', purse),
      { kind: 'decline' },
      purse,
    );
    expect(declined.gold).toBe(0);
    expect(eventOver(declined.event)).toBe(true);
  });
});

describe('the Drowned Reliquary', () => {
  it('holds three coffers, pays out the one opened, and costs nothing', () => {
    const event = openEvent(createRng('r'), 'reliquary', purse);
    if (event.id !== 'reliquary') throw new Error('not a reliquary');
    expect(event.coffers.map((c) => c.weight)).toEqual(['light', 'between', 'heavy']);
    const opened = actOnEvent(createRng('r1'), event, { kind: 'open', coffer: 2 }, purse);
    const holds = event.coffers[2]!.holds;
    if (holds.kind === 'gold') expect(opened.gold).toBe(holds.amount);
    else expect(opened.gained).toBe(holds.id);
    expect(opened.gold).toBeGreaterThanOrEqual(0);
    // Only one.
    expect(actOnEvent(createRng('r2'), opened.event, { kind: 'open', coffer: 0 }, purse).event).toBe(opened.event);
  });
});

describe('the Tithe-Taker', () => {
  it('takes a quarter if paid at once', () => {
    const event = openEvent(createRng('t'), 'tithe-taker', purse);
    const paid = actOnEvent(createRng('t1'), event, { kind: 'pay' }, purse);
    expect(paid.gold).toBe(-titheOf(purse.worth, TITHE_START, eventAnte(purse)));
  });

  it('never takes more than three of your antes, however rich you are', () => {
    const rich: EventPurse = { ...purse, worth: 100_000 };
    const paid = actOnEvent(createRng('t1'), openEvent(createRng('t'), 'tithe-taker', rich), { kind: 'pay' }, rich);
    expect(-paid.gold).toBe(TITHE_CAP_ANTES * eventAnte(rich));
  });

  it('comes down for a haggle that lands, and goes up and stops listening for one that does not', () => {
    let downs = 0;
    let ups = 0;
    for (let seed = 0; seed < 40; seed++) {
      const event = openEvent(createRng('t'), 'tithe-taker', purse) as TitheState;
      const next = actOnEvent(createRng(`hg${seed}`), event, { kind: 'haggle' }, purse).event as TitheState;
      if (next.last === 'down') {
        downs++;
        expect(next.rate).toBe(TITHE_START - 5);
        expect(next.deaf).toBe(false);
      } else {
        ups++;
        expect(next.rate).toBe(TITHE_START + 10);
        expect(next.deaf).toBe(true);
        expect(actOnEvent(createRng('again'), next, { kind: 'haggle' }, purse).event).toBe(next);
      }
    }
    expect(downs).toBeGreaterThan(ups);
  });

  it('takes a Medallion instead of gold', () => {
    const carrying: EventPurse = { ...purse, medallions: [{ id: 'hoard', level: 1 }] };
    const event = openEvent(createRng('t'), 'tithe-taker', carrying);
    const offered = actOnEvent(createRng('o'), event, { kind: 'offer', id: 'hoard' }, carrying);
    expect(offered.gold).toBe(0);
    expect(offered.lost).toBe('hoard');
  });
});

describe('a ? node on the map', () => {
  it('opens an event, applies what it pays, and goes back to the map once it is over', () => {
    // Stand on a node that leads to a ?, as if come down to it.
    const start: RunState = startRun('events', 'tyrant');
    const event = start.map.rows.flat().find((n) => n.kind === 'event')!;
    const parent = start.map.rows.flat().find((n) => n.links.includes(event.id))!;
    const run: RunState = { ...start, path: [parent.id] };
    const node = choices(run).find((n) => n.kind === 'event');
    expect(node).toBeDefined();
    const at = enterNode(run, node!.id);
    expect(at.phase).toBe('event');
    expect(at.seenEvents).toEqual([at.event!.id]);
    let now = at;
    for (let i = 0; i < 10 && !eventOver(now.event!); i++) {
      const e = now.event!;
      now = actInEvent(
        now,
        e.id === 'ferryman'
          ? { kind: 'decline' }
          : e.id === 'reliquary'
            ? { kind: 'open', coffer: 0 }
            : { kind: 'pay' },
      );
    }
    const back = leaveEvent(now);
    expect(back.phase).toBe('map');
    expect(back.event).toBeNull();
  });
});
