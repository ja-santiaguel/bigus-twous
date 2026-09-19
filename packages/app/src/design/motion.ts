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

/**
 * A held card swings a little as it is carried, as a card held at one point
 * does: its weight lags behind the hand, so it turns about the grip. Moving
 * right with a grip above its middle, the bottom trails and it leans
 * clockwise; held below the middle it leans the other way; held dead centre it
 * does not lean at all. The lean follows how fast the card itself is moving
 * (after FOLLOW), so it grows with a quick throw, eases off as the card slows,
 * and is gone when it stops.
 *
 * Degrees of lean per px/s of speed, at a grip on the card's top or bottom
 * edge: an ordinary drag of 400–600px/s leans 3–4° there and half that for a
 * grip halfway to the middle. A fast throw is capped at TILT_MAX_DEG.
 */
export const TILT_PER_SPEED = 0.007;
export const TILT_MAX_DEG = 6;
/**
 * The lean's own swing: a spring a little under critical damping, so a card
 * that stops sharply swings back past upright once, barely, as a hanging card
 * does — and then is still.
 */
export const TILT_SPRING = { stiffness: 320, damping: 26, mass: 1 };

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
