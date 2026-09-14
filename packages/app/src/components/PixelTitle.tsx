/**
 * Display lettering drawn as pixels: the "BIG TWO" of the share image.
 *
 * Hand-authored on a five-row grid — the same bitmaps the share image was
 * drawn from — so the game's title on its menu and on a link preview are one
 * piece of lettering, not a font approximating a drawing. A font at display
 * size also anti-aliases its edges; these are rects with crisp edges, sharp at
 * any whole-pixel size.
 *
 * One glyph pixel is one `--u` (see `.pixeltitle` in styles.css), and letters
 * sit one column apart, as in the share image.
 */
const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '####.'],
  D: ['####.', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  F: ['#####', '#....', '####.', '#....', '#....'],
  G: ['.####', '#....', '#..##', '#...#', '.####'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#....', '#....', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '####.', '#....', '#....'],
  R: ['####.', '#...#', '####.', '#..#.', '#...#'],
  S: ['.####', '#....', '.###.', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  '2': ['####.', '....#', '.###.', '#....', '#####'],
  ' ': ['...', '...', '...', '...', '...'],
};

const ROWS = 5;

export function PixelTitle({ text }: { text: string }) {
  const cells: { x: number; y: number }[] = [];
  let column = 0;
  for (const letter of text.toUpperCase()) {
    const glyph = GLYPHS[letter] ?? GLYPHS[' ']!;
    glyph.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === '#') cells.push({ x: column + x, y });
      });
    });
    column += glyph[0]!.length + 1;
  }
  const columns = Math.max(0, column - 1);

  return (
    <>
      <span className="sr-only">{text}</span>
      <svg
        className="pixeltitle"
        viewBox={`0 0 ${columns} ${ROWS}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
      >
        {cells.map(({ x, y }) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
        ))}
      </svg>
    </>
  );
}
