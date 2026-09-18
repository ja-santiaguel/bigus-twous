import { toRuns, type Bitmap } from './pixel.js';

/**
 * Interface icons, drawn as pixels like everything else on the board.
 *
 * An icon font or an icon set is a smooth vector shape, and beside cards whose
 * every edge is a whole art pixel it reads as a different material. These are
 * authored on a 7x7 grid and rendered at exactly one art pixel per grid cell,
 * so an icon pixel is the same size as a card pixel at every `--scale`.
 *
 * Seven, not nine: at one art pixel per cell a nine-cell icon is taller than
 * the text in the buttons it sits in. Seven is the smallest grid that still
 * draws a recognisable arrowhead.
 */

/** Two overlapping sheets — the near-universal "copy". */
const COPY: Bitmap = ['..#####', '..#...#', '#####.#', '#...#.#', '#...###', '#...#..', '#####..'];

/** An open circle with an arrowhead — "deal me another". */
const REFRESH: Bitmap = ['..###.#', '.#...##', '#...###', '#......', '#.....#', '.#...#.', '..###..'];

/** The tick in the copy toast. */
const CHECK: Bitmap = ['.......', '......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'];

/**
 * A plus — "take this seat".
 *
 * Not a chair and not a person: at seven pixels square a chair reads as a
 * bracket and a person reads as a profile picture, and neither says what
 * pressing it does. A plus in a seat's row says you are about to be added to
 * it, and the button's label says the rest.
 */
const SIT: Bitmap = ['...#...', '...#...', '...#...', '#######', '...#...', '...#...', '...#...'];

/** A question mark — how to play. */
const HELP: Bitmap = ['.#####.', '##...##', '.....##', '...###.', '...#...', '.......', '...#...'];

export const ICON_RUNS = {
  copy: toRuns(COPY),
  refresh: toRuns(REFRESH),
  check: toRuns(CHECK),
  help: toRuns(HELP),
  sit: toRuns(SIT),
} as const;

export type IconName = keyof typeof ICON_RUNS;
