import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { followPointer } from '../lib/pointerLabel.js';

/** How long the hint takes to leave: the shared --fade-out. */
const FADE_MS = 260;

/**
 * Why a button cannot be pressed, said at the pointer.
 *
 * A disabled button only says "not now". Pointing at one shows a short line
 * beside the cursor saying why — "Wait for your turn", "No cards picked" — so
 * the reason is where your attention already is. Any disabled control opts in
 * with a `data-hint` attribute; this is mounted once at the root.
 *
 * Found from the pointer's position rather than from events on the button,
 * because browsers do not deliver pointer events to disabled controls — the
 * topmost element there, so a control covered by a popup stays quiet. A mouse
 * only: a finger pressing a dead button gets the read-out and the rules sheet,
 * not a label that would sit under the fingertip.
 */
export function DisabledHint() {
  const [hint, setHint] = useState<{ text: string; leaving: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const position = useRef({ x: 0, y: 0 });
  /** What is on screen, readable from the listener without re-subscribing. */
  const shown = useRef<{ text: string; leaving: boolean } | null>(null);
  const show = (next: { text: string; leaving: boolean } | null) => {
    shown.current = next;
    setHint(next);
  };

  useEffect(() => {
    let frame = 0;
    let fade: ReturnType<typeof setTimeout> | undefined;

    const place = () => {
      if (ref.current) {
        followPointer(
          ref.current,
          ref.current.firstElementChild as HTMLElement | null,
          position.current.x,
          position.current.y,
        );
      }
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      position.current = { x: event.clientX, y: event.clientY };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Only what is actually on top: a button behind an open dialog, a
        // menu or the rules sheet is not what the pointer is on, so it says
        // nothing. (Every element under the point, which this used to read,
        // included the whole table behind the leave confirmation.)
        const top = document.elementFromPoint(event.clientX, event.clientY);
        const under = top?.closest<HTMLElement>(':disabled[data-hint]') ?? undefined;
        const text = under?.dataset['hint'];
        const current = shown.current;
        if (text) {
          clearTimeout(fade);
          fade = undefined;
          if (current?.text !== text || current.leaving) show({ text, leaving: false });
        } else if (current && !current.leaving) {
          show({ ...current, leaving: true });
          fade = setTimeout(() => show(null), FADE_MS);
        }
        place();
      });
    };

    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
      clearTimeout(fade);
    };
  }, []);

  // A new hint is measured and kept on screen before it is painted.
  useLayoutEffect(() => {
    if (ref.current) {
      followPointer(
        ref.current,
        ref.current.firstElementChild as HTMLElement | null,
        position.current.x,
        position.current.y,
      );
    }
  }, [hint?.text]);

  if (!hint) return null;
  return (
    <div
      ref={ref}
      className="cursorhint"
      aria-hidden="true"
      style={{ transform: `translate(${position.current.x}px, ${position.current.y}px)` }}
    >
      <span className={`cursorhint__text ${hint.leaving ? 'is-leaving' : ''}`}>{hint.text}</span>
    </div>
  );
}
