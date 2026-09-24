import { describe, expect, it } from 'vitest';
import { createRng } from '@big-two/engine';
import {
  ARCHETYPES,
  fitsClass,
  bridgesOf,
  FIRST_ELITE_ROW,
  FIRST_MERCHANT_ROW,
  generateMap,
  neverStraight,
  OPENING_ROWS,
  MAP_ROWS,
  MEDALLIONS,
  rewardOffers,
  shopOffers,
  tableOption,
  TIERS,
  type Archetype,
  type MapNode,
} from '../src/index.js';

/** The descent: short, plain tables at the top; longer ones below, with armed players. */
describe('the descent', () => {
  it('keeps the first room short, and every room deeper at least as long', () => {
    const lengths = TIERS.map((t) => t.hands);
    expect(lengths[0]).toBeLessThanOrEqual(5);
    for (let i = 1; i < lengths.length; i++) expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]!);
  });

  const option = (seed: string, tier: number, archetype: Archetype = 'modest') =>
    tableOption(createRng(seed), { tier, classId: 'tyrant', archetype, id: seed });

  it('seats nobody with Medallions in the first room, and arms players further down', () => {
    let top = 0;
    let deep = 0;
    for (let n = 0; n < 40; n++) {
      top += option(`top${n}`, 0).lineup.filter((p) => p.medallions.length > 0).length;
      deep += option(`deep${n}`, 3).lineup.filter((p) => p.medallions.length > 0).length;
    }
    expect(top).toBe(0);
    expect(deep).toBeGreaterThan(40);
  });

  it('arms each player only with what its class can carry, within the room’s level cap', () => {
    for (let n = 0; n < 20; n++) {
      for (const p of option(`cap${n}`, 3).lineup) {
        for (const m of p.medallions) {
          expect(fitsClass(m.id, p.classId)).toBe(true);
          expect(m.level).toBeLessThanOrEqual(TIERS[3]!.cpuMedallions.maxLevel);
        }
      }
    }
  });
});

describe('the map', () => {
  const maps = Array.from({ length: 300 }, (_, n) => generateMap(createRng(`map${n}`)));
  const byId = (rows: MapNode[][]) => new Map(rows.flat().map((n) => [n.id, n]));

  /** Every way down, gate to throne. */
  function paths(rows: MapNode[][]): MapNode[][] {
    const nodes = byId(rows);
    const out: MapNode[][] = [];
    const walk = (node: MapNode, trail: MapNode[]) => {
      const next = [...trail, node];
      if (node.kind === 'throne') out.push(next);
      for (const id of node.links) walk(nodes.get(id)!, next);
    };
    for (const start of rows[0]!) walk(start, []);
    return out;
  }

  it('is two lanes deep: eight rows of one to four nodes, then the throne', () => {
    for (const map of maps) {
      expect(map.rows).toHaveLength(MAP_ROWS + 1);
      expect(map.rows.at(-1)!.map((n) => n.kind)).toEqual(['throne']);
      for (const row of map.rows.slice(0, -1)) {
        expect(row.length).toBeGreaterThanOrEqual(2);
        expect(row.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('deepens by depth: two rows to each, the throne at the last', () => {
    for (const map of maps) {
      const tiers = map.rows.map((row) => row[0]!.tier);
      for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1]!);
      expect(tiers.at(-1)).toBe(TIERS.length - 1);
    }
  });

  it('starts with ordinary tables only', () => {
    for (const map of maps) {
      for (const node of map.rows[0]!) {
        expect(node.kind).toBe('table');
        expect(ARCHETYPES[node.archetype!].elite).toBe(false);
      }
    }
  });

  it('reaches every node from the top, and the throne from every node', () => {
    for (const map of maps) {
      for (let r = 1; r < map.rows.length; r++) {
        for (const node of map.rows[r]!) expect(map.rows[r - 1]!.some((p) => p.links.includes(node.id))).toBe(true);
      }
      for (const row of map.rows.slice(0, -1)) for (const node of row) expect(node.links.length).toBeGreaterThan(0);
    }
  });

  it('never crosses two paths', () => {
    for (const map of maps) {
      const nodes = byId(map.rows);
      for (const row of map.rows.slice(0, -1)) {
        for (let i = 0; i < row.length; i++) {
          for (let j = i + 1; j < row.length; j++) {
            const left = Math.max(...row[i]!.links.map((id) => nodes.get(id)!.col));
            const right = Math.min(...row[j]!.links.map((id) => nodes.get(id)!.col));
            expect(left).toBeLessThanOrEqual(right);
          }
        }
      }
    }
  });

  it('opens with ordinary tables: the first two rows hold nothing else', () => {
    for (const map of maps) {
      for (const node of map.rows.slice(0, OPENING_ROWS).flat()) {
        expect(node.kind).toBe('table');
        expect(ARCHETYPES[node.archetype!].elite).toBe(false);
      }
    }
  });

  it('puts one merchant in the upper half, on one lane, and the rest in the lower half', () => {
    for (const map of maps) {
      const upper = map.rows.flat().filter((n) => n.kind === 'merchant' && n.row < FIRST_MERCHANT_ROW);
      expect(upper).toHaveLength(1);
      expect(upper[0]!.row).toBeGreaterThanOrEqual(OPENING_ROWS);
    }
  });

  it('keeps the elite every way down meets to the third depth or deeper', () => {
    for (const map of maps) {
      const walls = map.rows
        .slice(0, MAP_ROWS)
        .filter((row) => row.every((n) => n.kind === 'table' && ARCHETYPES[n.archetype!].elite));
      expect(walls.length).toBeGreaterThanOrEqual(1);
      for (const row of walls) expect(row[0]!.row).toBeGreaterThanOrEqual(FIRST_ELITE_ROW);
    }
  });

  it('never puts more elites than ordinary tables in a lane', () => {
    for (const map of maps) {
      for (const lane of [0, 1]) {
        const inLane = map.rows.flat().filter((n) => n.lane === lane && n.kind === 'table');
        const elites = inLane.filter((n) => ARCHETYPES[n.archetype!].elite).length;
        expect(elites).toBeLessThanOrEqual(inLane.length - elites);
      }
    }
  });

  it('joins the two lanes by one bridge or two', () => {
    for (const map of maps) {
      expect(bridgesOf(map)).toBeGreaterThanOrEqual(1);
      expect(bridgesOf(map)).toBeLessThanOrEqual(2);
    }
  });

  it('hides one to four ? events below the opening rows, never one under another', () => {
    for (const map of maps) {
      const nodes = byId(map.rows);
      const events = map.rows.flat().filter((n) => n.kind === 'event');
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.length).toBeLessThanOrEqual(4);
      for (const e of events) {
        expect(e.row).toBeGreaterThanOrEqual(OPENING_ROWS);
        expect(e.links.some((id) => nodes.get(id)!.kind === 'event')).toBe(false);
      }
    }
  });

  it('never runs straight: every way down offers a choice at least every other step', () => {
    for (const map of maps) {
      expect(neverStraight(map)).toBe(true);
      for (const path of paths(map.rows)) {
        // Every step before the throne's; the last row only leads to it.
        const steps = path.slice(0, MAP_ROWS - 1);
        for (let i = 0; i + 1 < steps.length; i++) {
          expect(steps[i]!.links.length > 1 || steps[i + 1]!.links.length > 1).toBe(true);
        }
      }
    }
  });

  it('puts a merchant and an elite table on every way down', () => {
    for (const map of maps) {
      for (const path of paths(map.rows)) {
        expect(path.some((n) => n.kind === 'merchant')).toBe(true);
        expect(path.some((n) => n.kind === 'table' && ARCHETYPES[n.archetype!].elite)).toBe(true);
      }
    }
  });

  it('never puts a merchant under a merchant, save the early one', () => {
    for (const map of maps) {
      const nodes = byId(map.rows);
      for (const node of map.rows.flat()) {
        if (node.kind !== 'merchant' || node.row < FIRST_MERCHANT_ROW) continue;
        expect(node.links.some((id) => nodes.get(id)!.kind === 'merchant')).toBe(false);
      }
    }
  });
});

describe('rewards and the shop', () => {
  it('offers only what your class can carry', () => {
    for (let n = 0; n < 30; n++) {
      const rng = createRng(`offer${n}`);
      const offers = rewardOffers(rng, { classId: 'courtier', loadout: [], reward: 'elite', beaten: [] });
      for (const o of offers) expect(fitsClass(o.id, 'courtier')).toBe(true);
      for (const id of shopOffers(rng, 'commoner', [])) expect(fitsClass(id, 'commoner')).toBe(true);
    }
  });

  it('turns up an any-class Medallion now and then, but not often', () => {
    let neutral = 0;
    let total = 0;
    for (let n = 0; n < 300; n++) {
      for (const id of shopOffers(createRng(`neutral${n}`), 'commoner', [])) {
        total += 1;
        if (MEDALLIONS[id].classId === null) neutral += 1;
      }
    }
    expect(neutral).toBeGreaterThan(0);
    expect(neutral / total).toBeLessThan(0.3);
  });

  it('lets you loot a Medallion you can carry from a player you beat', () => {
    const beaten = [
      {
        key: 'x',
        name: 'Crowe',
        classId: 'tyrant' as const,
        temperament: 'steady' as const,
        difficulty: 'hard' as const,
        worth: 100,
        medallions: [
          { id: 'iron-crown' as const, level: 1 },
          { id: 'hoard' as const, level: 1 },
        ],
      },
    ];
    const offers = rewardOffers(createRng('loot'), { classId: 'tyrant', loadout: [], reward: 'standard', beaten });
    expect(offers.some((o) => o.kind === 'loot' && o.id === 'iron-crown' && o.from === 'Crowe')).toBe(true);
    // A Commoner can take Crowe's Hoard, never the Tyrant's crown.
    const loot = rewardOffers(createRng('loot'), { classId: 'commoner', loadout: [], reward: 'standard', beaten });
    expect(loot.find((o) => o.kind === 'loot')?.id).toBe('hoard');
  });
});
