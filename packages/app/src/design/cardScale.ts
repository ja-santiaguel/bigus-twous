/**
 * How big a card is, everywhere on the board.
 *
 * Three sizes. Not four, not "whatever that zone happened to need" — three,
 * named, and used by every zone. A card is one drawing at one authored size
 * (22x31 art pixels); a zone shows it larger or smaller, and that is the only
 * difference between a card in your hand and the same card in an opponent's.
 *
 * This replaces a scatter of per-zone art dimensions — a 10x14 drawing for
 * opponent fans, a 13x18 one for the tray, and separate hover and drag ratios.
 * Those were genuinely different pictures, which is why cards could not travel
 * between zones: you cannot interpolate one drawing into another. One drawing
 * and a scale can go anywhere.
 *
 * **Every value is a whole third.** The pixel scale is three device pixels per
 * art pixel, so thirds are exactly the factors that keep a resting card on
 * whole device pixels — a third is one device pixel per art pixel, two thirds
 * is two, and so on. Only the flight between two sizes leaves the grid, which
 * is the one exemption the pixel rules have always carried.
 */
export const CARD_SCALE = {
  /** Opponent hands — cards you can count but never read. */
  small: 2 / 3,
  /** Cards in play and the discard pile. The size a card simply *is*. */
  base: 1,
  /**
   * Your own hand, and the trick opened out for reading.
   *
   * Bigger than the cards on the table, on purpose. Your hand is the only
   * thing on this screen you actually operate: everything else reports what
   * has happened, and these are the thirteen objects you click, drag and
   * choose between. Drawing them at the same size as the record of a play
   * gave the two equal weight and left the fan reading as just more scenery.
   */
  large: 4 / 3,
  /** A card you are touching — hovered, or picked up. */
  raised: 5 / 3,
} as const;
