import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Gold, as every campaign screen shows it: a pixel coin, the amount, and — when
 * the amount changes — the amount counting to its new value while the change
 * itself rises off it (+59 in gold, −30 in red), so the ante leaving your
 * purse, the pot filling and a hand paying out are each seen happening rather
 * than found already done.
 *
 * `memory` names an amount that lives across screens (your gold, the pot, a
 * seat's gold): a display that mounts under a name already shown starts from
 * what was last shown there and counts to the new amount. That is how the
 * buy-in is seen leaving your gold between the map and the table, although the
 * two are different screens.
 */

const lastShown = new Map<string, number>();

/**
 * Forget what was last shown: a new run starts its gold afresh, rather than
 * counting down from where the last run ended.
 */
export function forgetGold(prefix = ''): void {
  for (const key of [...lastShown.keys()]) if (key.startsWith(prefix)) lastShown.delete(key);
}

/** How long the change is shown before the amount starts counting to it. */
const COUNT_LEAD_MS = 900;

/** How long a change takes to count through: longer for more, never slow. */
const countMs = (change: number) => Math.min(1600, 700 + Math.abs(change) * 2.5);

export function GoldAmount({
  value,
  memory,
  from,
  className = '',
  coin = true,
}: {
  value: number;
  memory?: string | undefined;
  /** Where to count from the first time this amount is shown: a table's gold from nothing, say. */
  from?: number | undefined;
  className?: string;
  coin?: boolean;
}) {
  const reduced = useReducedMotion() ?? false;
  const start = (memory !== undefined ? lastShown.get(memory) : undefined) ?? from ?? value;
  const [display, setDisplay] = useState(start);
  const [changes, setChanges] = useState<{ id: number; amount: number }[]>([]);
  const target = useRef(start);
  const shownRef = useRef(start);
  const ids = useRef(0);

  useEffect(() => {
    if (memory !== undefined) lastShown.set(memory, value);
    const previous = target.current;
    target.current = value;
    if (previous !== value) {
      const id = ++ids.current;
      setChanges((list) => [...list.slice(-2), { id, amount: value - previous }]);
      window.setTimeout(() => setChanges((list) => list.filter((c) => c.id !== id)), 2000);
    }
    // Count from whatever is on screen now — mid-count if a change lands
    // during another — to the new amount.
    const begin = shownRef.current;
    if (begin === value) return undefined;
    if (reduced) {
      shownRef.current = value;
      setDisplay(value);
      return undefined;
    }
    // The change is read first; the amount counts to it a beat later, so the
    // two land one after the other rather than as one blur.
    const duration = countMs(value - begin);
    let frame = 0;
    const lead = window.setTimeout(() => {
      const startedAt = performance.now();
      frame = requestAnimationFrame(function step(now) {
        const t = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - (1 - t) ** 3;
        const next = Math.round(begin + (value - begin) * eased);
        shownRef.current = next;
        setDisplay(next);
        if (t < 1) frame = requestAnimationFrame(step);
      });
    }, COUNT_LEAD_MS);
    return () => {
      window.clearTimeout(lead);
      cancelAnimationFrame(frame);
    };
  }, [value, memory, reduced]);

  return (
    <span className={`goldamount ${className}`}>
      {coin && <GoldCoin />}
      <span className="goldamount__value">{Math.round(display).toLocaleString('en-GB')}</span>
      {changes.map((change) => (
        <span
          key={change.id}
          className={`goldamount__change ${change.amount < 0 ? 'is-loss' : 'is-gain'}`}
          aria-hidden="true"
        >
          {change.amount < 0 ? '−' : '+'}
          {Math.abs(change.amount).toLocaleString('en-GB')}
        </span>
      ))}
    </span>
  );
}

/**
 * A gold coin in eight art pixels: a dark rim, a lit upper left, a shaded
 * lower right and a struck mark at its heart. Sized to the text beside it.
 */
export function GoldCoin({ className = '' }: { className?: string }) {
  return (
    <svg className={`goldcoin ${className}`} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      {/* rim */}
      <path
        fill="#6b4416"
        d="M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v4H0zM7 2h1v4H7zM1 6h1v1H1zM6 6h1v1H6zM2 7h4v1H2z"
      />
      {/* face */}
      <path fill="#d9a441" d="M2 1h4v1H2zM1 2h6v4H1zM2 6h4v1H2z" />
      {/* shade, lower right */}
      <path fill="#a8742a" d="M6 4h1v2H6zM5 5h1v1H5zM2 6h4v1H2z" />
      {/* light, upper left */}
      <path fill="#f3d58a" d="M2 2h2v1H2zM2 3h1v1H2z" />
      {/* the struck mark */}
      <path fill="#8a5a1c" d="M4 3h1v2H4z" />
    </svg>
  );
}
