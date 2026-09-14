/**
 * Fan geometry.
 *
 * Cards sit on an arc: each one rotates a little further round, and dips by
 * the sagitta of that angle so the fan curves rather than pivoting in place.
 * The table plane itself is flat and viewed from directly above — all the
 * dimensionality comes from the cards, which is why this needs to be right.
 *
 * Rotation is free here because cards are transformed quads in a perspective
 * scene rather than resampled bitmaps, so a fan does not chew up the pixel
 * grid the way rotating a sprite in 2D would.
 */

export interface FanSlot {
  /** Degrees, negative on the left of the fan. */
  angle: number;
  /** Horizontal offset in px from the fan's centre. */
  x: number;
  /** Vertical dip in px — larger toward the ends of the arc. */
  y: number;
}

export interface FanOptions {
  /** Degrees between adjacent cards. Clamped so big hands do not wrap round. */
  stepDegrees?: number;
  /** Total spread cap in degrees. */
  maxSpread?: number;
  /** Horizontal distance between adjacent cards, in px. */
  gap?: number;
  /** Arc radius in px; larger is flatter. */
  radius?: number;
}

/**
 * Every opponent fans identically.
 *
 * Three seats holding the same number of cards should look like three seats
 * holding the same number of cards — varying the arc per position made the
 * table read as three different widgets rather than one game. Only the
 * player's own hand differs, and it earns that: it is larger, interactive, and
 * has to stay legible while thirteen cards overlap.
 */
export const OPPONENT_FAN: Required<FanOptions> = {
  stepDegrees: 4,
  maxSpread: 34,
  gap: 13,
  radius: 200,
};

/** The player's hand: wider spread, flatter arc, bigger gaps. */
export const PLAYER_FAN: Omit<Required<FanOptions>, 'gap'> = {
  stepDegrees: 3.6,
  maxSpread: 40,
  radius: 620,
};

export function fanSlots(count: number, options: FanOptions = {}): FanSlot[] {
  const { stepDegrees = 4, maxSpread = 44, gap = 30, radius = 520 } = options;
  if (count <= 0) return [];
  if (count === 1) return [{ angle: 0, x: 0, y: 0 }];

  const spread = Math.min(stepDegrees * (count - 1), maxSpread);
  const step = spread / (count - 1);

  return Array.from({ length: count }, (_, i) => {
    const angle = -spread / 2 + step * i;
    const radians = (angle * Math.PI) / 180;
    return {
      angle,
      x: (i - (count - 1) / 2) * gap,
      // Sagitta of the arc — the dip that turns a row of rotated cards into a fan.
      y: (1 - Math.cos(radians)) * radius,
    };
  });
}
