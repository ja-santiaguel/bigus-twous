import { useEffect } from 'react';

/**
 * Publishes how far the page can still scroll down — `--scroll-rest` in CSS
 * pixels, and `--scroll-left` as a share of the whole, 1 at the top and 0 at
 * the end — for the backdrop's parallax: the ruins on the horizon rise into
 * full view as the page is scrolled to its end, slower than the page, so they
 * read as far behind it. A page that does not scroll publishes 0, and the
 * ruins stand in full view.
 */
export function useBackdropScroll(): void {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = Math.max(0, root.scrollHeight - root.clientHeight);
        const rest = Math.max(0, max - window.scrollY);
        root.style.setProperty('--scroll-rest', String(Math.round(rest)));
        // How much of the page is still below, from 1 at the top to 0 at the
        // end; 0 for a page that does not scroll.
        root.style.setProperty('--scroll-left', max > 0 ? (rest / max).toFixed(4) : '0');
      });
    };

    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // The page grows and shrinks without a scroll: a longer class description,
    // a screen changing. The body stays the window's height while a screen
    // overflows it, so it is the screens themselves that are watched — found
    // again whenever one screen gives way to another. Only that: watching
    // every change under them would force a layout on every frame of a card
    // in flight.
    const sizes = new ResizeObserver(measure);
    const app = document.getElementById('root') ?? document.body;
    const watchScreens = () => {
      sizes.disconnect();
      sizes.observe(document.body);
      for (const screen of Array.from(app.children)) sizes.observe(screen);
      measure();
    };
    watchScreens();
    const swaps = new MutationObserver(watchScreens);
    swaps.observe(app, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      sizes.disconnect();
      swaps.disconnect();
    };
  }, []);
}
