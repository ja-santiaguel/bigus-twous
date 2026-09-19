import { memo } from 'react';
import type { Card } from '@big-two/engine';
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
 *
 * The pip and the back's lattice are pixel-art assets (assets/cards), laid on
 * as a CSS mask filled with the card's own colour. Drawn inline they were an
 * SVG of a dozen to two dozen rects each — over a thousand elements across a
 * table of cards, all restyled and re-laid out whenever a card moved. As a
 * mask each is one box the browser rasterises once, and the colours still
 * come from the palette, so a red suit and a dimmed card are CSS as before.
 * Custom card art replaces these files, not this component.
 */
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
        <span className={`pip pip--large pip--${card.suit.toLowerCase()}`} />
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
  return <span className={`pcard pcard--back ${className}`} aria-hidden="true" />;
});
