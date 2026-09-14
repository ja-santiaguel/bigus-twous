import { useEffect, useRef, useState } from 'react';

/**
 * How long the seat on turn has left.
 *
 * **Always visible, never guessed at.** An earlier version hid itself for the
 * first half of a turn on the theory that a quiet board is a calm one. It is,
 * but it is also a board that springs a deadline on you: the moment the clock
 * appeared was the moment you learned there had been one, and until then you
 * had no way to know whether you had a minute or five seconds. A timer nobody
 * can read is worse than a timer nobody wanted.
 *
 * So the number is always there. What changes is only how loudly it is said:
 *
 *   over a third   dim — present, legible, ignorable
 *   under a third  gold — the same colour the board already uses for "your move"
 *   under a sixth  alert, and blinking
 *
 * In proportion to the allowance, so a minute's turn changes at 20 and 10
 * seconds and a pile pick of 15 at 5 and 2½ — the same warning either way.
 *
 * Three states rather than a continuous ramp, because a colour that creeps
 * through amber has no moment you can point at, and the whole job of this
 * thing is to give you moments you can point at.
 *
 * Drawn as whole pixels, like everything else here: a smooth ring or a sliding
 * bar needs sub-pixel coverage to describe its own edge, and anti-aliased grey
 * is exactly the thing that makes pixel work look like a screenshot of pixel
 * work. Segments go out one at a time, which also makes time countable rather
 * than merely visible.
 *
 * Nothing here decides anything. The table owns the deadline and acts on it;
 * if the two ever disagree the table is right, which is why every snapshot
 * resets this rather than letting a local timer run all the way down.
 */

/** Twelve segments: a whole number of them per five seconds of a minute. */
const SEGMENTS = 12;

/** Below this share of the allowance, the clock takes the board's "your move" colour. */
const NOTICE_SHARE = 1 / 3;

/** Below this share, it turns urgent and blinks. */
const URGENT_SHARE = 1 / 6;

/** How often the local count ticks between snapshots. */
const TICK_MS = 250;

export function TurnClock({
  remainingMs,
  totalMs,
  variant = 'inline',
  purpose = 'play',
}: {
  remainingMs: number;
  totalMs: number;
  /** `inline` sits in the controls row; `seat` sits under an opponent. */
  variant?: 'inline' | 'seat';
  /** What the time is for, for the spoken label. */
  purpose?: 'play' | 'pick';
}) {
  const left = useCountdown(remainingMs);

  const tone = left <= totalMs * URGENT_SHARE ? 'is-urgent' : left <= totalMs * NOTICE_SHARE ? 'is-notice' : 'is-calm';
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const lit = Math.max(0, Math.min(SEGMENTS, Math.ceil((left / Math.max(1, totalMs)) * SEGMENTS)));

  return (
    <span
      className={`clock clock--${variant} ${tone}`}
      role="timer"
      // Announced only when it is worth interrupting for. A screen reader
      // reading every tick of a minute is the same nagging in another form,
      // and the number is on screen the whole time for anyone who looks.
      aria-live={tone === 'is-urgent' ? 'assertive' : 'off'}
      aria-label={`${seconds} seconds left to ${purpose === 'pick' ? 'pick a pile' : 'play'}`}
    >
      {/* Number first, then the bar: the precise reading before the
          approximate one. Segments go out from the left, so the time that is
          left is the part nearest the controls it belongs to. */}
      <span className="clock__count" aria-hidden="true">
        {seconds}
      </span>
      <span className="clock__bar" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={`clock__seg ${i >= SEGMENTS - lit ? 'is-lit' : ''}`} />
        ))}
      </span>
    </span>
  );
}

/**
 * Counts down locally from whatever the table last said.
 *
 * The server sends a duration rather than a deadline, so there is no clock to
 * agree about — this walks it down and starts again from the next snapshot.
 * Drift within a single turn is a few milliseconds; drift accumulated across a
 * whole game would not be, which is why it resets rather than continuing from
 * wherever it had got to.
 */
function useCountdown(remainingMs: number): number {
  const [left, setLeft] = useState(remainingMs);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
    setLeft(remainingMs);
    if (remainingMs <= 0) return undefined;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setLeft(Math.max(0, remainingMs - elapsed));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [remainingMs]);

  return left;
}
