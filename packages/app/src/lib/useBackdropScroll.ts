import { useEffect } from 'react';

/**
 * Publishes how far the page can still scroll down, as `--scroll-rest` (a
 * number of CSS pixels), for the backdrop's parallax: the ruins on the horizon
 * sit at the foot of the screen when the page is scrolled to its end, and
 * further down the further there is still to go — moving at a fraction of the
 * page's speed, so they read as far behind it. A page that does not scroll
 * publishes 0, and the ruins stay put.
 */
export function useBackdropScroll(): void {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rest = Math.max(0, root.scrollHeight - root.clientHeight - window.scrollY);
        root.style.setProperty('--scroll-rest', String(Math.round(rest)));
      });
    };

    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // The page grows and shrinks without a scroll: a longer class description,
    // a screen changing.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, []);
}
