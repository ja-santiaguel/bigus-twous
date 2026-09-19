/**
 * Pixel bitmaps for the small marks drawn inline: the medal and the icons.
 *
 * Authored on a grid rather than taken from a font or an icon set. A font glyph
 * is a smooth vector shape — at this size it either anti-aliases into mush
 * against hard pixel edges, or it reads as text sitting on pixel art. Drawing
 * them as actual pixels is the difference between a pixel-art game and a game
 * with a pixel font. (The suit pips and the card back are the same kind of
 * drawing, kept as asset files in assets/cards — see PixelCard.)
 *
 * They render as SVG rects with crisp edges, so they stay sharp at any integer
 * scale.
 */

export type Bitmap = string[];

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
