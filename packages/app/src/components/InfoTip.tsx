import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * A small "[?]" beside a label that explains it on the spot.
 *
 * For somebody who skipped How to play and has arrived at a setting whose
 * choices mean nothing without the rules behind them. The explanation is the
 * few sentences that matter for this one setting, not a link to the whole sheet.
 *
 * Pointing at it or tabbing to it shows the note; moving away hides it. A click
 * or tap pins it open, which is how a phone reads it, and a second click,
 * Escape, or a click anywhere else closes it. The note floats: showing it
 * pushes nothing on the page.
 *
 * The glyph is 5 art pixels tall, the height of the "Host only" lock, so it
 * sits beside a small label without standing taller than it. The brackets are
 * what say it can be pressed; a bare "?" reads as punctuation.
 */
const GLYPH = ['##..###..##', '#......#..#', '#....##...#', '#.........#', '##...#...##'];

/** A short grace before hiding, so the pointer can cross onto the note. */
const HIDE_AFTER_MS = 120;

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;
  const panelId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable, so the listeners below are added once per opening rather than on
  // every render while the note is open.
  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);
  const close = useCallback(() => {
    cancelHide();
    setHovered(false);
    setFocused(false);
    setPinned(false);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close]);

  return (
    <span
      className="infotip"
      ref={root}
      // Mouse only: a touch fires enter and leave around every tap, which would
      // flash the note rather than open it.
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        cancelHide();
        setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        cancelHide();
        hideTimer.current = setTimeout(() => setHovered(false), HIDE_AFTER_MS);
      }}
    >
      <button
        type="button"
        className="infotip__trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onFocus={(event) => setFocused(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocused(false)}
        onClick={() => setPinned((was) => !was)}
      >
        <svg
          viewBox={`0 0 ${GLYPH[0]!.length} ${GLYPH.length}`}
          shapeRendering="crispEdges"
          className="infotip__glyph"
          aria-hidden="true"
          focusable="false"
        >
          {GLYPH.flatMap((row, y) =>
            [...row].map((cell, x) =>
              cell === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null,
            ),
          )}
        </svg>
      </button>
      {open && (
        <div className="infotip__panel" id={panelId} role="note">
          {children}
        </div>
      )}
    </span>
  );
}
