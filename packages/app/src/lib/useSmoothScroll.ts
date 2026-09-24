import { useEffect } from 'react';

/**
 * Smooth wheel scrolling for the page.
 *
 * A mouse wheel moves the page in hard steps; here each notch sets where the
 * page is headed and the page eases there, a little each frame, so a long
 * screen — the map, with the deep's ruins rising behind it — glides rather
 * than jumps. Only the page itself: a wheel over anything that scrolls on its
 * own (the node panel, the log, How to play) is left to it, and so are
 * pinch-zoom, trackpads' own momentum-free fine steps, touch and the keyboard.
 * Off when reduced motion is asked for.
 */

/** How much of the remaining distance is covered each frame: higher is snappier. */
const EASE = 0.14;

export function useSmoothScroll(): void {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const page = document.scrollingElement ?? document.documentElement;
    let target = window.scrollY;
    let frame = 0;

    const max = () => Math.max(0, page.scrollHeight - page.clientHeight);

    /** Whether something between the pointer and the page scrolls this way itself. */
    const scrollsItself = (from: EventTarget | null, dy: number) => {
      for (let el = from instanceof Element ? from : null; el && el !== document.body; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (!/(auto|scroll)/.test(style.overflowY) || el.scrollHeight <= el.clientHeight) continue;
        if (dy < 0 ? el.scrollTop > 0 : el.scrollTop < el.scrollHeight - el.clientHeight - 1) return true;
      }
      return false;
    };

    /** Where the glide last put the page, to tell its own moves from anyone else's. */
    let placed = window.scrollY;
    const step = () => {
      const now = window.scrollY;
      // Moved some other way mid-glide — a key, the scrollbar, a jump: that
      // wins, and the glide stops rather than dragging the page back.
      if (Math.abs(now - placed) > 2) {
        target = now;
        frame = 0;
        return;
      }
      const left = target - now;
      // At least a whole pixel a frame: the page's position is kept in whole
      // (device) pixels, and a smaller step would never land.
      const move = Math.sign(left) * Math.max(1, Math.abs(left) * EASE);
      const next = Math.abs(left) <= 1 ? target : now + move;
      window.scrollTo({ top: next, behavior: 'instant' });
      placed = window.scrollY;
      frame = Math.abs(target - placed) <= 1 ? 0 : requestAnimationFrame(step);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented || max() === 0) return;
      // A trackpad already scrolls smoothly, in fine steps: leave it be.
      if (event.deltaMode === 0 && Math.abs(event.deltaY) < 40) return;
      if (scrollsItself(event.target, event.deltaY)) return;
      event.preventDefault();
      const lines = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? page.clientHeight : 1;
      // Start from where the page is, if it was moved some other way since.
      if (!frame) {
        target = window.scrollY;
        placed = target;
      }
      target = Math.max(0, Math.min(max(), target + event.deltaY * lines));
      if (!frame) frame = requestAnimationFrame(step);
    };
    // Scrolled another way — a key, a scrollbar, a jump — and the glide
    // follows rather than fighting it.
    const onScroll = () => {
      if (!frame) target = window.scrollY;
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
}
