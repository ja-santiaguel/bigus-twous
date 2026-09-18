import { useEffect } from 'react';

/**
 * Publishes the height a phone browser is actually showing, as `--vh`.
 *
 * `100vh` on a phone is the viewport with the toolbars *hidden*, so a screen
 * sized to it puts its bottom row behind the toolbar that is on screen. `svh`
 * is meant to be the answer, and mostly is, but iOS has never been consistent
 * about it. `visualViewport.height` is not a guess: it is what is visible, and
 * it is reported again whenever the toolbars slide, the keyboard opens or the
 * phone is turned.
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--vh', `${Math.round(viewport.height)}px`);
      });
    };

    measure();
    viewport.addEventListener('resize', measure);
    // Scrolling the toolbars away changes what is visible without a resize.
    viewport.addEventListener('scroll', measure);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
    };
  }, []);
}
