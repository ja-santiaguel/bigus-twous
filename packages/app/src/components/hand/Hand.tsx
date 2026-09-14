import type React from 'react';
import { useCallback } from 'react';

/**
 * Your hand — the box it occupies, and nothing else.
 *
 * The cards belong to the card layer; this reports where the fan goes. Even
 * the sweep gesture has left, because a sweep is a gesture of the *table*: the
 * cards are not children of this element any more, so confining the box you
 * drag to this one rectangle was an arbitrary limit rather than a boundary
 * anything real sat behind.
 *
 * What is left is a zone in the sense the rest of the board uses the word: it
 * holds space, it reports a rectangle, and it lights up when a dragged card is
 * over it.
 */
export function Hand({
  containerRef,
  anchorRef,
  cardCount,
  dropActive,
}: {
  /** Published outward so other zones can hit-test against the fan. */
  containerRef?: React.RefObject<HTMLDivElement>;
  /** Anchor the card layer positions the fan into. */
  anchorRef: (el: HTMLElement | null) => void;
  cardCount: number;
  /** Lit while a dragged card would land here — dropping reorders the fan. */
  dropActive?: boolean;
}) {
  /**
   * One node, two consumers: the zone registry that measures it and the ref
   * published outward. The combined callback must keep a stable identity — a
   * fresh closure each render makes React detach and reattach it every time,
   * and since attaching re-measures and measuring sets state, that is an
   * infinite render loop rather than a wasted cycle.
   */
  const setNode = useCallback(
    (node: HTMLDivElement | null) => {
      if (containerRef) (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      anchorRef(node);
    },
    [anchorRef, containerRef],
  );

  return (
    <div
      ref={setNode}
      className={`hand ${dropActive ? 'is-drop-target' : ''}`}
      role="group"
      aria-label={`Your hand, ${cardCount} cards`}
    />
  );
}
