/**
 * How long a computer appears to think.
 *
 * This lives with the session rather than with a screen because *both* sides
 * need it and they must not answer it differently. A local game paces itself;
 * a server paces on behalf of everybody watching. When it lived in the client
 * only, the multiplayer tables had no pacing at all — four seats resolving
 * instantly, so a trick went round before anybody saw it happen.
 *
 * It stays out of the engine, though. A `setTimeout` inside rule resolution
 * would couple the rules to frame rate and break the moment a headless
 * simulation runs thousands of games. The engine is instant; only the watching
 * waits.
 */

export type Speed = 'instant' | 'normal';

export const SPEEDS: Speed[] = ['instant', 'normal'];

/**
 * How long a resolved CPU turn is left on screen before the next one starts.
 *
 * **Instant is not zero.** Three CPU turns resolving inside one frame is a
 * single flicker: the cards for two of them are never drawn at all, and from
 * your side of the table a play you never saw has already been beaten. A sixth
 * of a second is below the threshold where a pause reads as waiting but above
 * the one where a change reads as having happened, which is the whole job — it
 * is a buffer against *missing* a turn, not a pause for effect.
 *
 * **Normal varies, and takes its time.** A fixed delay is the thing that reads
 * as a machine: four turns metronomically spaced is a progress bar, not three
 * people thinking. The range is skewed toward its floor (see below), so most
 * turns come back within about a second and one now and then takes a couple —
 * which is what deciding actually looks like. The band is deliberately wide;
 * at half this it was legible but hurried, and a trick could go round before
 * you had finished reading the play that started it.
 *
 * **A pass takes longer than a play, at every speed.** Two reasons, and they
 * point the same way. Deciding you have nothing is not a quicker decision than
 * finding something — you only know once you have looked at everything and
 * come up empty. And a pass moves no cards: the board is identical afterwards
 * except for one small badge, so there is nothing for the eye to catch. A play
 * announces itself by arriving in the middle of the table; a pass has to be
 * given the time to be noticed at all.
 */
export type MoveKind = 'play' | 'pass';

const PACING: Record<Speed, Record<MoveKind, { min: number; max: number }>> = {
  instant: {
    play: { min: 160, max: 160 },
    pass: { min: 260, max: 260 },
  },
  normal: {
    play: { min: 900, max: 2400 },
    pass: { min: 1200, max: 2800 },
  },
};

export const SPEED_LABELS: Record<Speed, string> = {
  instant: 'Instant',
  normal: 'Normal',
};

/**
 * How long a CPU appears to think before its move is shown.
 *
 * Spent *before* the move lands, not after. Pausing afterwards paced the wrong
 * player: the gap fell between a move and the next one, so it read as the
 * following seat deliberating, and the seat that acted straight after you got
 * no pause at all — your own turn does not wait, so theirs began the instant
 * you finished. Whoever is about to act owns the pause.
 */
export function cpuTurnDelay(speed: Speed, kind: MoveKind = 'play'): number {
  const { min, max } = PACING[speed][kind];
  if (min === max) return min;
  // Squaring a uniform roll biases it toward the low end: the median lands
  // near a quarter of the range rather than halfway, so quick answers are the
  // rule and a long think is the exception. A flat distribution gave the
  // opposite impression — every CPU appearing to deliberate equally hard over
  // a forced single.
  const roll = Math.random() ** 2;
  return Math.round(min + roll * (max - min));
}

/**
 * Deliberately `Math.random`, not the seeded generator.
 *
 * Pacing is presentation: it changes when you see a turn, never what the turn
 * is. Drawing it from the seeded stream would make the same seed deal the same
 * cards only as long as nobody changed a delay, which is exactly the coupling
 * the seed exists to avoid.
 */

export function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A pacer for a table, ready to hand to `createGameSession`.
 *
 * `paced: false` is the headless seam — a bulk simulation or a test should not
 * spend wall clock on pauses nobody is watching.
 */
export function makePacer(options: { speed: () => Speed; paced?: () => boolean }): Pacer {
  return async (kind) => {
    if (options.paced && !options.paced()) return;
    const speed = options.speed();
    if (kind === 'pick') return wait(speed === 'instant' ? 0 : CPU_PICK_MS);
    return wait(cpuTurnDelay(speed, kind));
  };
}

/** How long a computer seat appears to deliberate over its pile. */
export const CPU_PICK_MS = 520;

/** What a pacer is: see `Pacer` in `./types`. Re-stated here to avoid a cycle. */
type Pacer = (kind: 'play' | 'pass' | 'pick') => Promise<void>;
