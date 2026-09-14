import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rect } from './zoneGeometry.js';

/**
 * Measures the zones the card layer positions cards into.
 *
 * Zones no longer own their cards — they are anchors: an empty box that says
 * "a hand goes here", "the trick goes here". This hook collects those boxes so
 * the layer can resolve a placement into a position.
 *
 * Measured rather than derived, because the board is responsive: the fan's
 * width, the middle of the table and the seats all move with the viewport, and
 * the one thing worse than measuring is a table of hard-coded coordinates that
 * is right at exactly one window size.
 *
 * Every box is reported relative to the viewport; `zoneGeometry` subtracts the
 * layer's own origin. Keeping the subtraction in one place is what stops the
 * two-coordinate-space confusion that made the old per-zone flights so
 * fragile.
 */
export function useZoneRects(): {
  /**
   * Ref callback for a zone anchor. Pass the zone's name.
   *
   * The returned callback is cached per name and is safe to use directly as a
   * `ref`. **Do not wrap it in an inline arrow** — a fresh closure each render
   * makes React detach and reattach the ref every time, which re-measures,
   * which sets state, which renders again. Combine it with another ref via
   * `useCallback` instead.
   */
  anchor: (name: string) => (el: HTMLElement | null) => void;
  rects: Record<string, Rect | null>;
  /** Re-measure now — for changes no observer can see, like a new round. */
  remeasure: () => void;
} {
  const nodes = useRef(new Map<string, HTMLElement>());
  const [rects, setRects] = useState<Record<string, Rect | null>>({});

  const measure = useCallback(() => {
    const next: Record<string, Rect | null> = {};
    for (const [name, el] of nodes.current) {
      const r = el.getBoundingClientRect();
      next[name] = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    setRects((prev) => (sameRects(prev, next) ? prev : next));
  }, []);

  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    // One observer for every anchor. A card's resting place depends on the
    // size of the zone it is in, so any zone changing shape has to re-resolve
    // the whole layer — there is no cheaper correct answer.
    observer.current = new ResizeObserver(measure);
    for (const el of nodes.current.values()) observer.current.observe(el);
    measure();

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    /*
     * Re-measure when the tab comes back to the front.
     *
     * A backgrounded tab can report zones as zero-sized, and a browser is free
     * to stop delivering resize notifications to one entirely — so a table
     * laid out while hidden is laid out against nothing, and stays that way
     * because no observer fires to correct it. It only mattered once the game
     * had other people in it: your own tab is in front while you play, but
     * everybody else's is behind something while they wait for their turn, and
     * they come back to a scrambled board.
     */
    document.addEventListener('visibilitychange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      document.removeEventListener('visibilitychange', measure);
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [measure]);

  /**
   * One ref callback per zone name, cached.
   *
   * The identity has to be stable across renders. A fresh closure each time
   * makes React detach the old ref (passing null) and attach the new one on
   * *every* render — and since attaching re-measures, and measuring sets
   * state, that is an infinite loop rather than a performance note. It brought
   * the board down with "maximum update depth exceeded" the first time this
   * ran.
   */
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const anchor = useCallback(
    (name: string) => {
      const existing = callbacks.current.get(name);
      if (existing) return existing;

      const callback = (el: HTMLElement | null) => {
        const previous = nodes.current.get(name);
        if (previous === el) return;
        if (previous) observer.current?.unobserve(previous);
        if (el) {
          nodes.current.set(name, el);
          observer.current?.observe(el);
        } else {
          nodes.current.delete(name);
        }
        measure();
      };
      callbacks.current.set(name, callback);
      return callback;
    },
    [measure],
  );

  return { anchor, rects, remeasure: measure };
}

function sameRects(a: Record<string, Rect | null>, b: Record<string, Rect | null>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (!x || !y) {
      if (x !== y) return false;
      continue;
    }
    if (x.x !== y.x || x.y !== y.y || x.width !== y.width || x.height !== y.height) return false;
  }
  return true;
}
