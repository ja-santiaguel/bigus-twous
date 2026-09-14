import { SORT_HINTS, SORT_LABELS, SORT_MODES, type SortMode } from '../../lib/handOrder.js';

/**
 * One button that cycles the hand arrangements.
 *
 * Two details make a cycling control usable rather than a mystery box:
 *
 * 1. The label names the *current* state, never the next one. Labelling a
 *    toggle with what the next click does is the classic way to confuse
 *    everybody who looks at it.
 * 2. The pips underneath say how many states exist and which one you are on.
 *    Without them, nothing on screen suggests there is a third option.
 *
 * A segmented control would be more discoverable still, but this is a
 * low-frequency control on a crowded hand plinth and the width matters more.
 * The hand animating into its new order is the confirmation, so there is no
 * toast and no flash.
 */
export function SortControl({ mode, onCycle }: { mode: SortMode; onCycle: () => void }) {
  const index = SORT_MODES.indexOf(mode);

  return (
    <div className="sort">
      <button
        className="sort__btn"
        onClick={onCycle}
        // Without an explicit label the title wins the name computation, and
        // the button announces as a whole sentence of explanation.
        aria-label={`Sort by ${SORT_LABELS[mode].toLowerCase()} — click to change`}
        title={`${SORT_HINTS[mode]} Click to change.`}
      >
        Sort · {SORT_LABELS[mode]}
      </button>
      <span className="sort__pips" aria-hidden="true">
        {SORT_MODES.map((m, i) => (
          <span key={m} className={`sort__pip ${i === index ? 'is-on' : ''}`} />
        ))}
      </span>
      {/* Announced on change without needing a visible status line. */}
      <span className="sr-only" role="status">
        {SORT_HINTS[mode]}
      </span>
    </div>
  );
}
