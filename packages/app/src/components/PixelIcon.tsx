import { ICON_RUNS, type IconName } from '../design/icons.js';

/**
 * One interface icon, as crisp-edged pixels.
 *
 * Decorative by definition: the button it sits in carries the accessible name,
 * so the drawing is hidden from assistive technology rather than described
 * twice.
 */
export function PixelIcon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 7 7" shapeRendering="crispEdges" className="icon" aria-hidden="true" focusable="false">
      {ICON_RUNS[name].map((run, i) => (
        <rect key={i} x={run.x} y={run.y} width={run.w} height={1} fill="currentColor" />
      ))}
    </svg>
  );
}
