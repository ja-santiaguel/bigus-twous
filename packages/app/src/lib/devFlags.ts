/**
 * Flags for trying things out on the dev server, read from the address bar.
 *
 * Only in development: `import.meta.env.DEV` is false in a production build,
 * so every flag here is null there and the code behind it is dropped.
 *
 *   ?demo=table          start a game on your own straight away
 *   ?seed=ABCD-2345      ...dealt from this seed, so a layout can be looked at on the same deal each time
 *   ?pace=fast           computers play at the fast pace all round — how a round plays out once you are out
 */

function param(name: string): string | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

export const devDemo = param('demo');
export const devSeed = param('seed');
export const devPace: 'fast' | null = param('pace') === 'fast' ? 'fast' : null;
