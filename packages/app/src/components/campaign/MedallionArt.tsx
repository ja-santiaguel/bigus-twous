import { memo } from 'react';
import type { MedallionId } from '@big-two/campaign';
import { pathsOf, type Drawing } from './ClassArt.js';

/**
 * Every Medallion's emblem, twelve art pixels square, in the game's palette:
 * the Wanderer's road, crowd and cup; the Courtier's crown, knife and purse;
 * the Tyrant's blood, iron and law; and the coin, scales, flask, candle and
 * chest any class may carry. Drawn at the page's pixel scale wherever a
 * Medallion is shown — its card, the run bar, the compendium.
 */

const PALETTE: Record<string, string> = {
  '#': 'var(--ink)',
  g: 'var(--gold)',
  G: '#f3d58a',
  o: '#8a5a1c',
  b: 'var(--bone)',
  d: 'var(--bone-dim)',
  s: '#3d4845',
  S: '#6e7c78',
  r: '#9c2019',
  R: '#d64c3c',
  k: '#1d2927',
};

const ART: Record<MedallionId, string[]> = {
  uprising: [
    '............',
    '.........##.',
    '.........#G#',
    '......##.#g#',
    '......#G##g#',
    '...##.#g##g#',
    '...#G##g##g#',
    '##.#g##g##g#',
    '#G##g##g##g#',
    '#g##g##g##g#',
    '#o##o##o##o#',
    '############',
  ],
  rabble: [
    '............',
    '......#.....',
    '.....#d#....',
    '..#.#ddd#.#.',
    '.#d##dkd##d#',
    '.#dd#dkd#dd#',
    '.#kd#ddd#dk#',
    '.#dd#ddd#dd#',
    '.#ddddddddd#',
    '.#ddddddddd#',
    '.#sssssssss#',
    '.###########',
  ],
  frugal: [
    '............',
    '....####....',
    '...#GGgo....',
    '..#GGggo#...',
    '.#Gggggo#...',
    '.#Ggggog#...',
    '.#ggggoo#...',
    '.#ggggo#....',
    '..#gggo#....',
    '...#ooo#....',
    '....###.....',
    '............',
  ],
  'low-road': [
    '##..........',
    'Ss#.........',
    'sSs#........',
    '#sSs####....',
    '.#sSSSSs#...',
    '..######Ss#.',
    '.......#sS#.',
    '..#####sS#..',
    '.#sSSSSs#.b.',
    '#sSs####.#d#',
    'sSs#.....#d#',
    'Ss#......###',
  ],
  'beggars-cup': [
    '.....##.....',
    '....#Gg#....',
    '.....##.....',
    '............',
    '.##########.',
    '#dbbbbbbbdd#',
    '#dkkkkkkkkd#',
    '.#dbbbbbbd#.',
    '..#ddbbdd#..',
    '...######...',
    '....#dd#....',
    '..########..',
  ],
  precedence: [
    '.#..#..#..#.',
    '#G##G##G##G#',
    '#gGggGggGgg#',
    '#oooooooooo#',
    '.##########.',
    '............',
    '.####.####..',
    '#bbb##bbb#..',
    '#b#b##b#b#..',
    '#bbb##bbb#..',
    '#bbb##bbb#..',
    '.###..###...',
  ],
  'royal-pair': [
    '..#.#.#.....',
    '..#g#g#.....',
    '.#######....',
    '#bbbbbb#....',
    '#bb##bb#....',
    '#b#bb#b#####',
    '#b####b#bbb#',
    '#b#bb#b#b#b#',
    '#bbbbbb#bbb#',
    '########b#b#',
    '.......#bbb#',
    '.......#####',
  ],
  intrigue: [
    '.....##.....',
    '....#oo#....',
    '..########..',
    '..#GgggggG#.',
    '..########..',
    '.....#b#....',
    '.....#b#....',
    '.....#b#....',
    '.....#d#....',
    '.....#d#....',
    '......#.....',
    '............',
  ],
  patronage: [
    '....#..#....',
    '.....##.....',
    '....#oo#....',
    '...##gg##...',
    '..#GGgggg#..',
    '.#GGggggggo#',
    '.#Gggggggoo#',
    '.#ggggggooo#',
    '.#gggggoooo#',
    '..#ggoooo#..',
    '...######...',
    '............',
  ],
  decree: [
    '............',
    '.##########.',
    '#dbbbbbbbbd#',
    '#bd#dd#ddbb#',
    '#bbbbbbbbbb#',
    '#bd#ddd#dbb#',
    '#bbbbbb###b#',
    '#bd#dd#rRr##',
    '#bbbbb#rrr#.',
    '#dbbbbb###d#',
    '.##########.',
    '............',
  ],
  'blood-rite': [
    '.....##.....',
    '.....#r#....',
    '....#rr#....',
    '....#rRr#...',
    '...#rRrr#...',
    '..#rRrrrr#..',
    '..#Rrrrrr#..',
    '.#rRrrrrrr#.',
    '.#rrrrrrrr#.',
    '..#rrrrrr#..',
    '...######...',
    '............',
  ],
  'iron-crown': [
    '#....#....#.',
    '#S..#S#..#S#',
    '#S#.#S#.#S#.',
    '#SS##SS##SS#',
    '#SSSSSSSSSS#',
    '#SsSSsSSsSS#',
    '#ssssssssss#',
    '#sSsrsSsrss#',
    '#ssssssssss#',
    '.##########.',
    '............',
    '............',
  ],
  unbowed: [
    '.##########.',
    '#SSSSSSSSSS#',
    '#Sss#SS#ssS#',
    '#Ssss##sssS#',
    '#Ss######sS#',
    '#Ssss##sssS#',
    '.#Sss##ssS#.',
    '.#SssssssS#.',
    '..#SssssS#..',
    '...#SssS#...',
    '....#SS#....',
    '.....##.....',
  ],
  'ferrymans-coin': [
    '....####....',
    '..##GGgg##..',
    '.#GGgggggo#.',
    '.#Gggggggo#.',
    '#Ggggoggggo#',
    '#Gggo##gggo#',
    '#gggo##gggo#',
    '#ggggooggoo#',
    '.#gggggggo#.',
    '.#goooooooo#',
    '..##oooo##..',
    '....####....',
  ],
  tithe: [
    '.....##.....',
    '.....##.....',
    '#.#########.',
    '##....##..##',
    '#g#...##.#.#',
    '#g#...##.#.#',
    '#Gg#..###g#.',
    '#go#..##GgG#',
    '####..######',
    '......##....',
    '....######..',
    '...#oooooo#.',
  ],
  'iron-stomach': [
    '....####....',
    '....#bb#....',
    '....#SS#....',
    '...##SS##...',
    '..#SSSSSS#..',
    '.#SSSSSSSs#.',
    '.#SSbbbSss#.',
    '.#SSSSSSss#.',
    '.#SSSSSsss#.',
    '.#Sssssss#..',
    '..########..',
    '............',
  ],
  'last-rites': [
    '.....#......',
    '....#G#.....',
    '....#gG#....',
    '...#gGG#....',
    '....#o#.....',
    '...##k##....',
    '...#bbb#....',
    '...#bbd#....',
    '...#bbd#....',
    '..#bbbdd#...',
    '.#########..',
    '#ssssssssss#',
  ],
  hoard: [
    '............',
    '..########..',
    '.#oooooooo#.',
    '#oggggggggo#',
    '############',
    '#ooooGGoooo#',
    '#oggg#Gggoo#',
    '#oggg##ggoo#',
    '#ogggggggoo#',
    '#oooooooooo#',
    '############',
    '............',
  ],
};

const PATHS = Object.fromEntries(
  Object.entries(ART).map(([id, rows]) => {
    const used = new Set(rows.join('').replace(/\./g, ''));
    const drawing: Drawing = {
      rows,
      palette: Object.fromEntries([...used].map((ch) => [ch, PALETTE[ch]!])),
    };
    return [id, pathsOf(drawing)];
  }),
) as Record<MedallionId, { color: string; d: string }[]>;

/** A Medallion's emblem. Sealed, it is drawn as one flat shadow. */
export const MedallionSprite = memo(function MedallionSprite({
  id,
  className = '',
  sealed = false,
}: {
  id: MedallionId;
  className?: string;
  sealed?: boolean;
}) {
  return (
    <svg
      className={`medsprite ${sealed ? 'is-sealed' : ''} ${className}`}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[id].map(({ color, d }) => (
        <path key={color} d={d} fill={sealed ? 'currentColor' : color} />
      ))}
    </svg>
  );
});
