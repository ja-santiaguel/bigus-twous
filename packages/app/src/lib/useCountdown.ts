import { useEffect, useRef, useState } from 'react';

/**
 * Whole seconds left on a countdown the server sent as a duration.
 *
 * Counted down locally from the moment the duration arrived, and restarted
 * from each new one — the server's number is the truth, this only fills in the
 * seconds between snapshots. Null when there is no countdown.
 */
export function useCountdown(remainingMs: number | null): number | null {
  const started = useRef<{ at: number; ms: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    started.current = remainingMs === null ? null : { at: Date.now(), ms: remainingMs };
    setNow(Date.now());
    if (remainingMs === null) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [remainingMs]);

  const from = started.current;
  if (!from) return null;
  return Math.max(0, Math.ceil((from.ms - (now - from.at)) / 1000));
}
