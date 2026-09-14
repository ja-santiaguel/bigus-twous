import { MEDAL_RUNS } from '../../design/pixel.js';

/**
 * Where a seat finished, shown in place of its card count once it is empty.
 *
 * It used to say "Out". That word is wrong here in a way that matters: in most
 * games out means eliminated, and in this one emptying your hand is how you
 * *win*. A player watching the seat that just beat them read "Out" as bad news
 * for that seat. A medal and an ordinal say the opposite, and say it without
 * needing the word at all.
 *
 * Fourth place gets no medal — there are three, and the last seat holding
 * cards has not finished so much as run out of round.
 */
const ORDINALS = ['1st', '2nd', '3rd', '4th'];
const TONES = ['is-gold', 'is-silver', 'is-bronze', 'is-last'];

export function PlaceBadge({ place }: { place: number }) {
  const tone = TONES[place] ?? 'is-last';
  const label = ORDINALS[place] ?? `${place + 1}th`;

  return (
    <span className={`place ${tone}`}>
      {place < 3 && (
        <svg
          viewBox="0 0 9 9"
          shapeRendering="crispEdges"
          className="place__medal"
          aria-hidden="true"
          focusable="false"
        >
          {MEDAL_RUNS.map((run, i) => (
            <rect key={i} x={run.x} y={run.y} width={run.w} height={1} fill="currentColor" />
          ))}
        </svg>
      )}
      {/* The ordinal is already on screen; the screen-reader line says what it
          means. Marking the visible copy hidden stops it being read twice. */}
      <span className="place__text" aria-hidden="true">
        {label}
      </span>
      <span className="sr-only">finished {label}</span>
    </span>
  );
}
