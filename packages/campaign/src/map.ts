import type { Rng } from '@big-two/engine';
import { ARCHETYPES, FINALE_TIER, type Archetype } from './tiers.js';

/**
 * The descent: a map read from the top down, drawn fresh for every run from
 * its seed, laid out as Slay the Spire lays out an act.
 *
 * Two primary lanes run from the gate to the throne. Now and then a lane
 * splits into a sub-lane — two nodes side by side, a choice of encounter —
 * and joins again below. One or two **bridges** lead from one lane into the
 * other, and no more: the lanes stay two ways down, not a web. Paths never
 * cross, and no way down runs straight: a choice comes at least every other
 * step. Eight rows of encounters, two to each depth, then the Hollow Throne.
 *
 * What every run meets, whichever way it goes:
 *   - **two ordinary tables first**: the first two rows are nothing else;
 *   - **a Bone Merchant in the lower half** on every way down, and one more
 *     in the upper half on one of the two lanes — an early chance to shop
 *     for whoever goes that way;
 *   - **an elite table**, and never more elites than ordinary tables in a lane.
 * The merchant and the elite are placed on rows where neither lane splits,
 * one on each lane, so no path can go round them. Sub-lanes may hold extra
 * elites and merchants as optional encounters, and **? events** turn up on
 * about one ordinary spot in five below the first two rows. A merchant never
 * leads to a merchant — save the early one, which may sit just above the
 * lower merchant — nor an event to an event.
 */

export type NodeKind = 'table' | 'merchant' | 'event' | 'throne';

export interface MapNode {
  id: string;
  /** The row, from the top. */
  row: number;
  /** The depth the row belongs to: the room's tier, its antes and stakes. */
  tier: number;
  /** Position within its row, left to right. */
  col: number;
  /** The primary lane the node stands in, left (0) or right (1). */
  lane?: number;
  kind: NodeKind;
  /** For a table: what kind. */
  archetype?: Archetype;
  /** Ids of the nodes this one leads to, in the row below. */
  links: string[];
}

export interface RunMap {
  rows: MapNode[][];
}

/** Rows of encounters above the throne: two to each depth. */
export const MAP_ROWS = 8;
/** Rows to each depth. */
const ROWS_PER_TIER = MAP_ROWS / FINALE_TIER;
/** The first rows, ordinary tables only. */
export const OPENING_ROWS = 2;
/**
 * The first row the elite every way down must meet may stand on: the third
 * depth. Earlier, it made the second depth a wall — a quarter of runs ended
 * there. Optional elites in sub-lanes may still come sooner.
 */
export const FIRST_ELITE_ROW = 4;
/** The first row a merchant may stand on: the lower half of the map. */
export const FIRST_MERCHANT_ROW = MAP_ROWS / 2;
/** Bridges from one lane into the other: at least one, at most two. */
export const BRIDGES = [1, 2] as const;

const ORDINARY: Archetype[] = ['modest', 'desperation', 'mirror'];
const ELITE: Archetype[] = ['high-stakes', 'predator'];

/** Chances, by depth: that a lane splits on a row, and that a sub-lane node is elite or a merchant. */
const SPLIT_CHANCE = [0.35, 0.45, 0.5, 0.5];
const EXTRA_ELITE = [0, 0.2, 0.35, 0.45];
const EXTRA_MERCHANT = [0, 0, 0.15, 0.1];
/** The chance that an ordinary spot below the opening rows is a ? event. */
const EVENT_CHANCE = 0.2;

const tierOfRow = (row: number) => Math.min(FINALE_TIER - 1, Math.floor(row / ROWS_PER_TIER));
const isElite = (n: MapNode) => n.kind === 'table' && n.archetype !== undefined && ARCHETYPES[n.archetype].elite;
const isOrdinary = (n: MapNode) => n.kind === 'table' && !isElite(n);

export function generateMap(rng: Rng): RunMap {
  // A draw that cannot meet every rule is drawn again, from the same stream.
  for (let attempt = 0; attempt < 400; attempt++) {
    const map = drawMap(rng);
    if (map) return map;
  }
  throw new Error('No map satisfies its rules');
}

function drawMap(rng: Rng): RunMap | null {
  // The rows that must hold the lanes' merchant and elite: the merchant in the
  // lower half, the elite from the third depth, never on adjacent rows,
  // neither split.
  const merchantRow = FIRST_MERCHANT_ROW + Math.floor(rng() * (MAP_ROWS - 1 - FIRST_MERCHANT_ROW)); // rows 4–6
  const eliteRows = Array.from({ length: MAP_ROWS - OPENING_ROWS }, (_, i) => i + OPENING_ROWS).filter(
    (r) => Math.abs(r - merchantRow) >= 2 && r >= FIRST_ELITE_ROW,
  );
  if (eliteRows.length === 0) return null;
  const eliteRow = pick(rng, eliteRows);
  // The early merchant: below the opening rows, above the lower half, and
  // not on the elite row. Either lane: both still meet the lower merchant.
  const earlyRows = Array.from({ length: FIRST_MERCHANT_ROW - OPENING_ROWS }, (_, i) => i + OPENING_ROWS).filter(
    (r) => r !== eliteRow,
  );
  if (earlyRows.length === 0) return null;
  const earlyRow = pick(rng, earlyRows);
  const earlyLane = rng() < 0.5 ? 0 : 1;

  // Each row: for each of the two lanes, one node, or two where it splits.
  const shapes: number[][] = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    const fixed = r === 0 || r === merchantRow || r === eliteRow;
    const t = tierOfRow(r);
    shapes.push([0, 1].map(() => (!fixed && rng() < SPLIT_CHANCE[t]! ? 2 : 1)));
  }

  const rows: MapNode[][] = shapes.map((lanes, r) => {
    const nodes: MapNode[] = [];
    lanes.forEach((count, lane) => {
      for (let k = 0; k < count; k++) {
        nodes.push({
          id: `n${r}-${nodes.length}`,
          row: r,
          tier: tierOfRow(r),
          col: nodes.length,
          lane,
          kind: 'table',
          links: [],
        });
      }
    });
    return nodes;
  });
  rows.push([{ id: 'throne', row: MAP_ROWS, tier: FINALE_TIER, col: 0, kind: 'throne', links: [] }]);

  // Links, drawn so that no two paths cross, no way down runs straight, and
  // one or two bridges join the lanes.
  const gaps = linkRows(rng, rows.slice(0, MAP_ROWS));
  if (!gaps) return null;
  gaps.forEach((spans, r) =>
    spans.forEach(([lo, hi], i) => {
      rows[r]![i]!.links = rows[r + 1]!.slice(lo, hi + 1).map((n) => n.id);
    }),
  );
  for (const node of rows[MAP_ROWS - 1]!) node.links = ['throne'];

  // What each node holds.
  const parentsOf = (node: MapNode) =>
    node.row === 0 ? [] : rows[node.row - 1]!.filter((p) => p.links.includes(node.id));
  const earlyInLane = rows[earlyRow]!.filter((n) => n.lane === earlyLane);
  const early = earlyInLane[Math.floor(rng() * earlyInLane.length)]!;
  for (let r = 0; r < MAP_ROWS; r++) {
    const t = tierOfRow(r);
    const kinds = shuffled(rng, ORDINARY);
    const ordinary = () => kinds.shift() ?? pick(rng, ORDINARY);
    for (const node of rows[r]!) {
      if (node === early) {
        node.kind = 'merchant';
        continue;
      }
      if (r === merchantRow) {
        node.kind = 'merchant';
        continue;
      }
      if (r === eliteRow) {
        node.archetype = pick(rng, ELITE);
        continue;
      }
      if (r < OPENING_ROWS) {
        node.archetype = ordinary();
        continue;
      }
      const split = rows[r]!.filter((n) => n.lane === node.lane).length > 1;
      const parents = parentsOf(node);
      const children = rows[r + 1]?.filter((c) => node.links.includes(c.id)) ?? [];
      const nearMerchant =
        [...parents, ...children].some((n) => n.kind === 'merchant') || Math.abs(r - merchantRow) < 2;
      if (split && r >= FIRST_MERCHANT_ROW && !nearMerchant && rng() < EXTRA_MERCHANT[t]!) {
        node.kind = 'merchant';
        continue;
      }
      if (split && rng() < EXTRA_ELITE[t]!) {
        node.archetype = pick(rng, ELITE);
        continue;
      }
      if (!parents.some((p) => p.kind === 'event') && rng() < EVENT_CHANCE) {
        node.kind = 'event';
        continue;
      }
      node.archetype = ordinary();
    }
  }

  // Never more elites than ordinary tables in a lane: an optional elite goes
  // back to being ordinary first, then an event gives way to an ordinary table.
  for (const lane of [0, 1]) {
    const inLane = rows
      .slice(0, MAP_ROWS)
      .flat()
      .filter((n) => n.lane === lane);
    const count = (test: (n: MapNode) => boolean) => inLane.filter(test).length;
    for (const node of [...inLane].reverse()) {
      if (count(isElite) <= count(isOrdinary)) break;
      if (node.row !== eliteRow && isElite(node)) node.archetype = pick(rng, ORDINARY);
    }
    for (const node of inLane) {
      if (count(isElite) <= count(isOrdinary)) break;
      if (node.kind === 'event') {
        node.kind = 'table';
        node.archetype = pick(rng, ORDINARY);
      }
    }
    if (count(isElite) > count(isOrdinary)) return null;
  }
  // One to four ? events a map: a run always has one to find, never a map of them.
  const events = rows.flat().filter((n) => n.kind === 'event').length;
  if (events < 1 || events > 4) return null;
  return { rows };
}

/** Where one node's ways down run: an unbroken span of the row below, first to last. */
type Span = [lo: number, hi: number];

/**
 * The links between each pair of rows, as each node's span of the row below.
 *
 * Laid out as Slay the Spire lays out its paths: spans run left to right and
 * may share an end but never overlap, so no two paths cross; every node below
 * is reached; a node leads to one node or two. No way down runs straight — a
 * node reached by a single way must itself offer two, save the last row,
 * which only leads to the throne. And the lanes are joined by one or two
 * bridges: links from a node in one lane to a node in the other.
 *
 * Each pair of rows draws from every layout that obeys this, weighted toward
 * one way down, so branches stay a choice rather than a web; where a choice
 * demanded below cannot be met, the row above is drawn again.
 */
function linkRows(rng: Rng, rows: MapNode[][]): Span[][] | null {
  const out: Span[][] = [];
  const last = rows.length - 1;
  const bridgesIn = (here: MapNode[], below: MapNode[], spans: Span[]) =>
    spans.reduce((sum, [lo, hi], i) => {
      let n = 0;
      for (let c = lo; c <= hi; c++) if (below[c]!.lane !== here[i]!.lane) n++;
      return sum + n;
    }, 0);
  let steps = 0;
  const solve = (r: number, mustChoose: Set<number>, bridges: number): boolean => {
    if (++steps > 4000) return false;
    if (r === last) return bridges >= BRIDGES[0];
    const here = rows[r]!;
    const below = rows[r + 1]!;
    const layouts = spansOf(here.length, below.length)
      .filter((spans) => [...mustChoose].every((i) => spans[i]![1] > spans[i]![0]))
      .map((spans) => ({ spans, bridges: bridgesIn(here, below, spans) }))
      .filter((l) => bridges + l.bridges <= BRIDGES[1]);
    const weight = (l: { spans: Span[]; bridges: number }) =>
      l.spans.reduce((w, [lo, hi]) => w * (hi > lo ? 0.45 : 1), 1) * (l.bridges > 0 ? 0.25 : 1);
    // A weighted draw without replacement: each layout keyed by rng^(1/weight).
    const order = layouts.map((l) => ({ l, key: rng() ** (1 / weight(l)) })).sort((a, b) => b.key - a.key);
    for (const { l } of order) {
      // The nodes below reached by a single way, which must offer a choice —
      // unless they are the last row, which only leads to the throne.
      const next = new Set<number>();
      if (r + 1 < last) for (const [lo, hi] of l.spans) if (lo === hi) next.add(lo);
      out[r] = l.spans;
      if (solve(r + 1, next, bridges + l.bridges)) return true;
    }
    return false;
  };
  return solve(0, new Set(), 0) ? out : null;
}

/** Every layout of spans from a row of `n` nodes onto a row of `m`: in order, touching, covering, one or two wide. */
function spansOf(n: number, m: number): Span[][] {
  const out: Span[][] = [];
  const walk = (i: number, reached: number, acc: Span[]) => {
    if (i === n) {
      if (reached === m - 1) out.push(acc);
      return;
    }
    for (const lo of i === 0 ? [0] : [reached, reached + 1]) {
      if (lo > m - 1) continue;
      for (const hi of [lo, lo + 1]) {
        if (hi > m - 1) continue;
        walk(i + 1, hi, [...acc, [lo, hi]]);
      }
    }
  };
  walk(0, -1, []);
  return out;
}

/** Whether every way down has a choice at least every other step before the throne. */
export function neverStraight(map: RunMap): boolean {
  const byId = new Map(map.rows.flat().map((n) => [n.id, n] as const));
  return map.rows
    .slice(0, MAP_ROWS - 2)
    .flat()
    .every((node) => node.links.length > 1 || node.links.every((id) => byId.get(id)!.links.length > 1));
}

/** Links from one primary lane into the other: the map's bridges. */
export function bridgesOf(map: RunMap): number {
  const byId = new Map(map.rows.flat().map((n) => [n.id, n] as const));
  let bridges = 0;
  for (const node of map.rows.flat()) {
    for (const id of node.links) {
      const to = byId.get(id)!;
      if (to.kind !== 'throne' && to.lane !== node.lane) bridges++;
    }
  }
  return bridges;
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function nodeById(map: RunMap, id: string): MapNode | undefined {
  for (const row of map.rows) {
    const node = row.find((n) => n.id === id);
    if (node) return node;
  }
  return undefined;
}

/** Where a run can go next: the first row, or where the last node visited leads. */
export function reachable(map: RunMap, path: readonly string[]): MapNode[] {
  const last = path[path.length - 1];
  if (last === undefined) return map.rows[0] ?? [];
  const node = nodeById(map, last);
  return node ? node.links.flatMap((id) => nodeById(map, id) ?? []) : [];
}

/** The depth you are choosing in: the tier of the next row down. */
export function depthOf(map: RunMap, path: readonly string[]): number {
  return map.rows[Math.min(path.length, map.rows.length - 1)]?.[0]?.tier ?? 0;
}
