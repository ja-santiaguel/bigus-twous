/**
 * Suit pips as hand-authored pixel bitmaps.
 *
 * These are drawn on a 9×9 grid rather than taken from a font or an icon set.
 * A font suit is a smooth vector shape — at card size it either anti-aliases
 * into mush against hard pixel edges, or it simply looks like text sitting on
 * a pixel-art card. Authoring the pips as actual pixels is the difference
 * between a pixel-art game and a game with a pixel font.
 *
 * They render as SVG rects with crisp edges, so they stay sharp at any integer
 * scale and under the 3D transforms the table applies to cards.
 */

export type Bitmap = string[];

const HEART: Bitmap = [
  '.##...##.',
  '#########',
  '#########',
  '#########',
  '.#######.',
  '..#####..',
  '...###...',
  '....#....',
  '.........',
];

const DIAMOND: Bitmap = [
  '....#....',
  '...###...',
  '..#####..',
  '.#######.',
  '#########',
  '.#######.',
  '..#####..',
  '...###...',
  '....#....',
];

const SPADE: Bitmap = [
  '....#....',
  '...###...',
  '..#####..',
  '.#######.',
  '#########',
  '#########',
  '.##.#.##.',
  '....#....',
  '...###...',
];

const CLUB: Bitmap = [
  '...###...',
  '..#####..',
  '...###...',
  '.##.#.##.',
  '#########',
  '#########',
  '.###.###.',
  '....#....',
  '...###...',
];

export interface PixelRun {
  x: number;
  y: number;
  w: number;
}

/**
 * Collapses each row of filled pixels into horizontal runs, so a pip renders
 * as ~10 rects instead of ~50. With 13 cards in hand and two pips each, that
 * is the difference between a few hundred DOM nodes and a few thousand.
 */
export function toRuns(bitmap: Bitmap): PixelRun[] {
  const runs: PixelRun[] = [];
  bitmap.forEach((row, y) => {
    let start = -1;
    for (let x = 0; x <= row.length; x++) {
      const filled = row[x] === '#';
      if (filled && start === -1) start = x;
      if (!filled && start !== -1) {
        runs.push({ x: start, y, w: x - start });
        start = -1;
      }
    }
  });
  return runs;
}

/** Precomputed at module load — the bitmaps never change. */
export const SUIT_RUNS = {
  HEART: toRuns(HEART),
  DIAMOND: toRuns(DIAMOND),
  SPADE: toRuns(SPADE),
  CLUB: toRuns(CLUB),
} as const;

/**
 * The card back motif: a lattice that tiles without needing an image asset,
 * drawn on the same grid discipline as the pips.
 */
export const CARD_BACK_MOTIF: Bitmap = [
  '..#..#..',
  '.#.##.#.',
  '#..##..#',
  '.#.##.#.',
  '..#..#..',
  '.#.##.#.',
  '#..##..#',
  '.#.##.#.',
];

export const CARD_BACK_RUNS = toRuns(CARD_BACK_MOTIF);

/**
 * A medal, for a seat that has finished the round.
 *
 * Drawn on the same 9×9 grid as the suit pips, for the same reason: a glyph or
 * an icon-set medal is a smooth vector shape, and at this size it either
 * anti-aliases into mush beside the cards or reads as text pretending to be
 * art. Two ribbon straps over a disc is about the least detail that still
 * reads as "placed" rather than "eliminated".
 */
const MEDAL: Bitmap = [
  '.#.....#.',
  '.#.....#.',
  '..#...#..',
  '..#####..',
  '.#######.',
  '.#######.',
  '.#######.',
  '..#####..',
  '.........',
];

export const MEDAL_RUNS = toRuns(MEDAL);
