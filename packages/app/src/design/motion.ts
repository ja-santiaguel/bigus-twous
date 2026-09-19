import type { Transition } from 'framer-motion';

/**
 * Motion vocabulary.
 *
 * Snappy, not springy. Long, bouncy springs read as mush against hard pixel
 * edges — the card arrives before its outline settles, and the whole thing
 * looks soft in a way the art is not. Everything here is a short ease-out
 * tween instead, in the 120–220ms band.
 *
 * Cards are transformed quads in a perspective scene, so rotation and Z
 * translation are free. What is never animated is a non-integer *source*
 * scale, which is the thing that actually destroys pixel art.
 */

export const SNAP: Transition = { duration: 0.16, ease: 'easeOut' };
export const SETTLE: Transition = { duration: 0.22, ease: 'easeOut' };

/**
 * A card you are holding, following the pointer. A little behind it, as a
 * card held between the fingers trails the hand: a spring, but critically
 * damped (damping = 2·√stiffness), so it closes the gap and stops without
 * overshooting — the lag reads as weight, never as wobble. At this stiffness
 * it trails by about 40ms and catches up within ~150ms of the pointer
 * stopping.
 */
export const FOLLOW: Transition = { type: 'spring', stiffness: 600, damping: 49, mass: 1 };

/** Cards dealing in, one after another. */
export const DEAL_STAGGER_S = 0.04;

/**
 * Reduced motion does not mean no feedback — it means no travel. Positions
 * snap, opacity still carries the change, so a card appearing on the table is
 * still noticeable without anything sliding across the screen.
 */
export const NONE: Transition = { duration: 0 };

export function transition(reduced: boolean, base: Transition): Transition {
  return reduced ? NONE : base;
}
