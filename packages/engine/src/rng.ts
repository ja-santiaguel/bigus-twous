/**
 * A small seeded PRNG (mulberry32). Deterministic RNG is a deliberate
 * architectural choice: the engine must never call Math.random() directly,
 * so that games are replayable/debuggable now and server-authoritative /
 * verifiable once multiplayer exists.
 */
export type Rng = () => number;

export function createRng(seed: string): Rng {
  let a = hashSeed(seed);
  return function mulberry32() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Fisher-Yates shuffle using an injected Rng — never Math.random(). */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}
