import { useEffect, useState } from 'react';

/** The phone layout's breakpoint — the same width `styles.css` switches at. */
export const COMPACT_QUERY = '(max-width: 720px)';

/**
 * Whether a media query matches, kept current as the window changes.
 *
 * For the few places where a layout is a different arrangement of controls
 * rather than different CSS on the same ones — a control that moves, or one
 * that exists only on a phone. Rendering one arrangement or the other keeps a
 * hidden duplicate out of the page and out of the accessibility tree.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}
