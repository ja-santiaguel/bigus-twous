/**
 * Seeds: one format, everywhere.
 *
 * A seed is a promise that the same string deals the same cards — alone, at a
 * shared table, or copied from one into the other. That promise was broken in
 * two ways at once: playing alone made `ABCD-2345`, a shared table made
 * `ABC123-1789…`, and even the same string would not have dealt the same piles,
 * because the deal shared its random stream with the pick order (see
 * `createGameSession`). Both sides now use these helpers and nothing else.
 *
 * The alphabet is the table-code alphabet — no I, O, 0 or 1 — because the
 * reason to note a seed down is to type it in again, possibly from somebody
 * reading it aloud.
 */

export const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** What a seed may contain once normalised. */
export const SEED_PATTERN = /^[A-Z0-9-]{1,32}$/;

/** A fresh, readable seed: two groups of four. */
export function makeSeed(random: () => number = Math.random): string {
  let seed = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) seed += '-';
    seed += SEED_ALPHABET[Math.floor(random() * SEED_ALPHABET.length)];
  }
  return seed;
}

/**
 * Tidies something a person typed into a seed.
 *
 * Upper-cased, because case is not part of a seed anybody reads aloud, and
 * stripped to the characters a seed can hold, so a pasted seed with a stray
 * space still deals what it was copied from.
 */
export function normalizeSeed(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
}

export function isSeed(value: unknown): value is string {
  return typeof value === 'string' && SEED_PATTERN.test(value);
}
