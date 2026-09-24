import { useEffect } from 'react';

/**
 * Publishes where the deep's ruins stand, as `--backdrop-y` (how far below
 * the screen's foot they are sunk), for the backdrop's parallax: they rise as
 * the page scrolls, at a fraction of its pace, so they read as far behind it.
 * Also `--scroll-rest`, how far the page can still scroll down, in pixels.
 */
/** How far the ruins are sunk below the screen's foot at a page's top, as a share of their height. */
const BACKDROP_SUNK = 56 / 96;
/** The fastest the ruins rise, as a share of the page's own scrolling. */
const BACKDROP_SPEED = 0.3;

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
        // The ruins: sunk by up to BACKDROP_SUNK of their height at the top
        // of a page that scrolls, rising as it is scrolled — never faster
        // than BACKDROP_SPEED of the page, so they always read as far behind
        // it, and in full view by the end where the page is long enough for
        // that at that pace. A page that does not scroll shows them whole.
        const art = parseFloat(getComputedStyle(document.body, '::after').height) || 0;
        const sunk = art * BACKDROP_SUNK;
        const speed = max > 0 ? Math.min(BACKDROP_SPEED, sunk / max) : 0;
        const shift = max > 0 ? Math.max(0, sunk - window.scrollY * speed) : 0;
        root.style.setProperty('--backdrop-y', `${shift.toFixed(1)}px`);
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
