import { memo } from 'react';
import type { Card, Suit } from '@big-two/engine';
import { CARD_BACK_RUNS, SUIT_RUNS } from '../../design/pixel.js';
import { SUIT_IS_RED, cardSpoken } from '../../lib/format.js';

/**
 * A playing card, drawn rather than imaged.
 *
 * The face carries exactly two marks: the rank in the corner, and one suit pip
 * in the middle. A real card repeats both in every corner, but at pixel size
 * that repetition is noise — and a rotated rank is an outright misread, since
 * an upside-down 7 reads as a 2. The corner rank is what stays visible when
 * cards overlap in a fan, so it does the work; the centre pip identifies the
 * suit when the card sits alone on the table.
 */

/*
 * Every card is drawn from rectangles — a rank, a pip of a dozen runs, a back
 * of several dozen. Fifty-two of those redraw on every render of the layer,
 * and the layer renders on every pointer move while a finger slides along the
 * hand. None of it can change unless the card does, so none of it is rebuilt
 * unless the card does.
 */
const Pip = memo(function Pip({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg
      viewBox="0 0 9 9"
      shapeRendering="crispEdges"
      className={`pip ${className ?? ''}`}
      aria-hidden="true"
      focusable="false"
    >
      {SUIT_RUNS[suit].map((run, i) => (
        <rect key={i} x={run.x} y={run.y} width={run.w} height={1} fill="currentColor" />
      ))}
    </svg>
  );
});

export const CardFace = memo(function CardFace({ card, dimmed = false }: { card: Card; dimmed?: boolean }) {
  const tone = SUIT_IS_RED[card.suit] ? 'is-red' : 'is-black';
  return (
    <span className={`pcard pcard--face ${tone} ${dimmed ? 'is-dimmed' : ''}`}>
      {/* The only two-character rank in the deck. Cards overlap in the fan and
          on the table, and what stays visible is the left edge — so a "10"
          whose second glyph falls under the next card reads as a bare "1".
          It gets its own class to tighten up into the strip that shows. */}
      <span className={`pcard__rank ${card.rank === '10' ? 'is-wide' : ''}`} aria-hidden="true">
        {card.rank}
      </span>
      <span className="pcard__centre" aria-hidden="true">
        <Pip suit={card.suit} className="pip--large" />
      </span>
      <span className="sr-only">{cardSpoken(card)}</span>
    </span>
  );
});

/**
 * A face-down card. It renders no rank or suit data at all — not hidden with
 * CSS, not tucked in a data attribute. Remembering what has been played is
 * meant to be a player's skill, and it would take one devtools glance to
 * defeat that if the values were present in the DOM. The same discipline is
 * what keeps hidden information honest once real opponents exist.
 */
export const CardBack = memo(function CardBack({ className = '' }: { className?: string }) {
  return (
    <span className={`pcard pcard--back ${className}`} aria-hidden="true">
      <svg viewBox="0 0 8 8" width="100%" height="100%" shapeRendering="crispEdges" focusable="false">
        {CARD_BACK_RUNS.map((run, i) => (
          <rect key={i} x={run.x} y={run.y} width={run.w} height={1} fill="currentColor" />
        ))}
      </svg>
    </span>
  );
});
