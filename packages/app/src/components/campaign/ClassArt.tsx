import { memo } from 'react';
import type { ClassId } from '@big-two/campaign';

/**
 * Each class's emblem, as pixel art.
 *
 * Drawn on a grid like the suits, but painted rather than marked, in the
 * manner of the Ruined King and the Nameless King: dark steel and slate,
 * faces lost in shadow, silver hair, and a muted spectral light over all of
 * it — a rim on the lit side, a mist at the hem. All four share that paint;
 * what tells them apart is their shape and one small accent in their class's
 * colour. The Commoner, a hooded wanderer, carries a lantern whose flame is
 * the rust; the Courtier, a porcelain mask under a steel circlet with silver
 * hair either side, wears the violet in a gem and a collar trim; the Tyrant,
 * a hood under a steel crown with spectral points and a slit of light for a
 * face, white hair torn sideways by the wind, has blood-red stones in the
 * crown; the Seer, not at the table yet, is a shroud with one pale eye and a
 * grey-teal glint.
 *
 * The drawings were composed from shapes and shaded with a seeded pass, then
 * frozen here as rows, so they never change between builds.
 *
 * One path per colour, so an emblem is a handful of nodes however detailed.
 */

export type EmblemId = ClassId | 'seer';

/** Characters in a drawing, and the colour each stands for. `.` is empty. */
export type Palette = Record<string, string>;

export interface Drawing {
  rows: string[];
  palette: Palette;
}

/**
 * The paint every portrait shares: ink, slate and steel, silver hair, bone,
 * ember and a muted spectral light — the rim on the lit side, the mist at
 * the hem. Each class adds its cloth (`1`–`3`: one steel for all four, so
 * their colour lives in their equipment) and its accent (`a`).
 */
const PAINT: Palette = {
  K: 'var(--art-ink)',
  S: 'var(--art-slate)',
  M: 'var(--art-slate-mid)',
  L: 'var(--art-slate-hi)',
  v: 'var(--art-hair-lo)',
  w: 'var(--art-hair)',
  W: 'var(--art-hair-hi)',
  x: 'var(--art-spectral-lo)',
  y: 'var(--art-spectral)',
  z: 'var(--art-spectral-hi)',
  b: 'var(--art-bone)',
  B: 'var(--art-bone-hi)',
  o: 'var(--art-ember-lo)',
  e: 'var(--art-ember)',
  E: 'var(--art-ember-hi)',
};

const DRAWINGS: Record<EmblemId, Drawing> = {
  commoner: {
    rows: [
      '........................',
      '........................',
      '...........x22..........',
      '.........x22113.........',
      '........x2221222........',
      '.......x1221K2222.......',
      '......x112KKKKK32.......',
      '......x122KKKKK22.......',
      '......x12KKKKKKK12......',
      '......x11KKyKKyK12......',
      '.......x22KKKKK122......',
      '.......x22KKKKK122......',
      '.......x2111K211232.....',
      '......x2211222222M3.....',
      '.....x12211222112LL.....',
      '....x12211122112LLLL....',
      '....x1221112212MLaaM....',
      '....x11111222112LEaM....',
      '...x11211122212MLaeM3...',
      '...x1121112221M2LaaM3...',
      '...x11211122112MMMMM3...',
      '...x11111111111221223...',
      '..x1111111211122212222..',
      '.xxxyxxxxxxxxxx2yx2xx2xx',
    ],
    palette: {
      ...PAINT,
      a: 'var(--class-commoner)',
      '1': 'var(--cloth-commoner-1)',
      '2': 'var(--cloth-commoner-2)',
      '3': 'var(--cloth-commoner-3)',
    },
  },
  courtier: {
    rows: [
      '........................',
      '........................',
      '........................',
      '........................',
      '.........x22212.........',
      '........x22Kz122........',
      '........xeeeEeee........',
      '.......x2vKKKKKw2.......',
      '.......x2bvBBBvb1.......',
      '.......xKvKybyKv2.......',
      '.......xKvbbbbbv2.......',
      '.......x2wKbbbKv2.......',
      '........vvKKbKKvv.......',
      '.......xvvKKKK21v.......',
      '......xavv1KK211v.......',
      '.....xa22112a21122......',
      '.....x12111M2M11232.....',
      '.....x2111221122322.....',
      '....x112111221122212....',
      '....x111111211132112....',
      '....x111112211222122....',
      '....x221112111121222....',
      '...x11111112112211122...',
      '.xxxyx1xy1xx1xx2yx2xy.xx',
    ],
    palette: {
      ...PAINT,
      a: 'var(--class-courtier)',
      '1': 'var(--cloth-courtier-1)',
      '2': 'var(--cloth-courtier-2)',
      '3': 'var(--cloth-courtier-3)',
    },
  },
  tyrant: {
    rows: [
      '............E...........',
      '..........E.e.E.........',
      '..........e.e.e.........',
      '...v....Evewe.eE........',
      '..v.vvvweWeSe.ee........',
      '.vWW..WWooaoaoao........',
      'v...WWWWSSSSSSSS........',
      'vvvvWWvvSSKKKKSS........',
      '.....vvSSKKyKyKSS.......',
      '...vvvwSSKKKxKKSS.......',
      '.vWWvwvSSKKKzKKSS.......',
      'vvvvv..vSKKKyKKS........',
      '...vvvvwSKKKxKKS........',
      '.......x1SKKKKS12.......',
      '......x2111SS21123......',
      '.....x1221122211222.....',
      '.....x2211122212221.....',
      '....x112112221122212....',
      '....x121112221122222....',
      '....x111111211122x12....',
      '....x2x1112221122122....',
      '....x1111122112222x2....',
      '...x111111111122x1122...',
      '.xxxyx1xy1xx1xx2yx2xy.xx',
    ],
    palette: {
      ...PAINT,
      a: 'var(--class-tyrant)',
      '1': 'var(--cloth-tyrant-1)',
      '2': 'var(--cloth-tyrant-2)',
      '3': 'var(--cloth-tyrant-3)',
    },
  },
  seer: {
    rows: [
      '........................',
      '........................',
      '...........x1...........',
      '..........x211..........',
      '.........x21222.........',
      '........x22KK222........',
      '........x2KKKK22........',
      '........x2KKKK22........',
      '.......x2KKKKKK22.......',
      '.......x2KKyzxK22.......',
      '.......x2KKKKKK22.......',
      '.......x22KKKK211.......',
      '.......x21KKKK112.......',
      '......x2211Ka22122......',
      '......x22112222123......',
      '......x21112211232......',
      '......x21112211223......',
      '.....x1211122112322.....',
      '.....x1211222112222.....',
      '.....x1111221122211.....',
      '.....x1111221122212.....',
      '.....x1111211122212.....',
      '....x211112111221222....',
      '.xx.yx1xy1xx1xx2yx2xx.xx',
    ],
    palette: {
      ...PAINT,
      a: 'var(--class-seer)',
      '1': 'var(--cloth-seer-1)',
      '2': 'var(--cloth-seer-2)',
      '3': 'var(--cloth-seer-3)',
    },
  },
};

/** A drawing as one path per colour, built once. */
export function pathsOf(drawing: Drawing): { color: string; d: string }[] {
  const byColor = new Map<string, string[]>();
  drawing.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      if (ch === '.') {
        x++;
        continue;
      }
      let end = x;
      while (row[end] === ch) end++;
      const color = drawing.palette[ch] ?? 'currentColor';
      const runs = byColor.get(color) ?? [];
      runs.push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
      byColor.set(color, runs);
      x = end;
    }
  });
  return [...byColor].map(([color, runs]) => ({ color, d: runs.join('') }));
}

const PATHS = Object.fromEntries(
  (Object.keys(DRAWINGS) as EmblemId[]).map((id) => [id, pathsOf(DRAWINGS[id])]),
) as Record<EmblemId, { color: string; d: string }[]>;

export const ClassEmblem = memo(function ClassEmblem({ id, className = '' }: { id: EmblemId; className?: string }) {
  const drawing = DRAWINGS[id];
  const width = drawing.rows[0]!.length;
  return (
    <svg
      className={`emblem ${className}`}
      viewBox={`0 0 ${width} ${drawing.rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[id].map(({ color, d }) => (
        <path key={color} d={d} fill={color} />
      ))}
    </svg>
  );
});
