import { memo } from 'react';
import { pathsOf, type Drawing } from './ClassArt.js';

/**
 * The souls' pictures: small glyphs, seven art pixels square, for the figures
 * a table asks of you — what a seat costs, what a hand costs, what it asks you
 * to win, how long it lasts — drawn in the souls' own grey-teal, the colour of
 * something drowned, and bone where a card shows.
 */

// Outlined in the souls' dark tone rather than ink: a glyph sits on a dark
// panel, where an ink edge would vanish and leave only its fill.
const PALETTE: Record<string, string> = {
  '#': 'var(--soul-lo)',
  s: 'var(--soul)',
  S: 'var(--soul)',
  o: 'var(--soul-hi)',
  b: 'var(--bone)',
  d: 'var(--bone-dim)',
};

export type StatGlyphKind = 'buyin' | 'ante' | 'tribute' | 'hands';

// Each glyph is a picture, a row to a line.
// prettier-ignore
const GLYPHS: Record<StatGlyphKind, string[]> = {
  // Souls stacked for the seat: three coins, one on another.
  buyin: [
    '.#####.',
    '#oSSSs#',
    '.#####.',
    '#oSSSs#',
    '.#####.',
    '#oSSSs#',
    '.#####.',
  ],
  // One soul falling into the pot.
  ante: [
    '..###..',
    '..#o#..',
    '..###..',
    '#.....#',
    '#s...s#',
    '.#sSs#.',
    '..###..',
  ],
  // The chalice the tribute fills.
  tribute: [
    '#######',
    '#oSSSs#',
    '.#SSs#.',
    '..#s#..',
    '...#...',
    '..###..',
    '.#####.',
  ],
  // Two cards, one over the other: the hands the table lasts.
  hands: [
    '####...',
    '#bd#...',
    '#b####.',
    '#b#bb#.',
    '###b##.',
    '..#bb#.',
    '..####.',
  ],
};

const PATHS = Object.fromEntries(
  Object.entries(GLYPHS).map(([kind, rows]) => {
    const used = new Set(rows.join('').replace(/\./g, ''));
    const drawing: Drawing = { rows, palette: Object.fromEntries([...used].map((ch) => [ch, PALETTE[ch]!])) };
    return [kind, pathsOf(drawing)];
  }),
) as Record<StatGlyphKind, { color: string; d: string }[]>;

/** A figure's glyph, sized to the label beside it. */
export const StatGlyph = memo(function StatGlyph({ kind }: { kind: StatGlyphKind }) {
  return (
    <svg className="statglyph" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {PATHS[kind].map(({ color, d }) => (
        <path key={color} d={d} fill={color} />
      ))}
    </svg>
  );
});
