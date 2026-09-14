/**
 * "Only the host can change this", said once, beside the setting it is about.
 *
 * A setting somebody else controls is shown exactly as the host sees it — the
 * same rows, the same chosen option — so everyone at the table reads the same
 * table. What differs is that it cannot be pressed, and this tag says why, so a
 * locked control reads as a decision that belongs to someone rather than a
 * control that is broken.
 *
 * The lock is a 5x5 bitmap at one art pixel per cell: the 7x7 icon grid would
 * stand twice the height of the small label beside it.
 */
const LOCK = ['.###.', '.#.#.', '#####', '##.##', '#####'];

export function HostOnly({ label = 'Host only' }: { label?: string }) {
  return (
    <span className="hostonly">
      <svg viewBox="0 0 5 5" shapeRendering="crispEdges" className="hostonly__lock" aria-hidden="true" focusable="false">
        {LOCK.flatMap((row, y) =>
          [...row].map((cell, x) =>
            cell === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null,
          ),
        )}
      </svg>
      {label}
    </span>
  );
}
