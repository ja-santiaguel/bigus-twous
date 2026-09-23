import { memo } from 'react';
import { CLASSES, type ClassId } from '@big-two/campaign';
import type { SeatPosition } from '../../lib/format.js';
import { pathsOf, type Drawing } from './ClassArt.js';
import { GoldCoin } from '../GoldAmount.js';

/**
 * A seat whose player has fallen — out of gold, and out of the table for good.
 * Where the fan was, a gravestone; the name struck through and faded, the
 * class dimmed beside it, and under it "Fallen" and an empty purse. The chair
 * is not filled — the table is one player smaller for the rest of it, and the
 * stone says who is missing.
 *
 * The hand after the seat falls (`fresh`), the stone drops into place
 * and the name fades out as you watch; after that it simply stands there.
 */

const STONE: Drawing = {
  rows: [
    '...#####...',
    '..#sssss#..',
    '.#sssssss#.',
    '.#ssbbbss#.',
    '.#sbbbbbs#.',
    '.#sbobobs#.',
    '.#sbbbbbs#.',
    '.#ssbsbss#.',
    '.#sscssss#.',
    '.#ssscsss#.',
    '###########',
    '#ggggggggg#',
  ],
  palette: {
    '#': 'var(--ink)',
    s: '#3d4845',
    b: 'var(--bone-dim)',
    o: 'var(--ink)',
    c: '#2a3331',
    g: 'var(--table-hi)',
  },
};
const STONE_PATHS = pathsOf(STONE);

export const BrokeSeat = memo(function BrokeSeat({
  name,
  classId,
  position,
  fresh,
}: {
  name: string;
  classId: ClassId;
  position: SeatPosition;
  /** Fell in the hand just played: the stone drops in as it is first shown. */
  fresh: boolean;
}) {
  return (
    <div className={`opp opp--${position} is-broke ${fresh ? 'is-fresh' : ''}`} aria-label={`${name} has fallen`}>
      <span className="opp__name">
        <span className="opp__who">{name}</span>
        <span className={`opp__role classtag classtag--${classId}`}>{CLASSES[classId].name}</span>
      </span>
      <div className="brokeseat__stone">
        <svg viewBox="0 0 11 12" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
          {STONE_PATHS.map(({ color, d }) => (
            <path key={color} d={d} fill={color} />
          ))}
        </svg>
      </div>
      <span className="opp__meta">
        <span className="brokeseat__word">Fallen</span>
        <span className="opp__sep">·</span>
        <span className="brokeseat__gold">
          <GoldCoin /> 0
        </span>
      </span>
    </div>
  );
});
