import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { followPointer } from '../lib/pointerLabel.js';
import { onCopied, type CopyNotice } from '../lib/copy.js';
import { PixelIcon } from './PixelIcon.js';

const SHOWN_MS = 1400;

/**
 * The little speech bubble that says something was copied.
 *
 * It appears at the pointer that did the copying and follows it for a moment,
 * so the confirmation is wherever your eyes already are. Mounted once at the
 * root; anything that copies through `copyWithNotice` gets it for free.
 */
export function CopyToast() {
  const [notice, setNotice] = useState<CopyNotice | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => onCopied(setNotice), []);

  useEffect(() => {
    if (!notice) return undefined;
    let frame = 0;
    // Moved by writing the transform directly: re-rendering React on every
    // pointer event to move one bubble would be a lot of work for nothing.
    const follow = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (ref.current) {
          followPointer(ref.current, ref.current.firstElementChild as HTMLElement | null, e.clientX, e.clientY);
        }
      });
    };
    window.addEventListener('pointermove', follow);
    const timer = setTimeout(() => setNotice(null), SHOWN_MS);
    return () => {
      window.removeEventListener('pointermove', follow);
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [notice]);

  // Kept on screen from its first frame, not only once the pointer moves.
  useLayoutEffect(() => {
    if (notice && ref.current) {
      followPointer(ref.current, ref.current.firstElementChild as HTMLElement | null, notice.x, notice.y);
    }
  }, [notice]);

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {notice?.message ?? ''}
      </div>
      {notice && (
        <div
          key={notice.id}
          ref={ref}
          className="toast"
          aria-hidden="true"
          style={{ transform: `translate(${notice.x}px, ${notice.y}px)` }}
        >
          <span className="toast__bubble">
            <PixelIcon name="check" />
            {notice.message}
          </span>
        </div>
      )}
    </>
  );
}
