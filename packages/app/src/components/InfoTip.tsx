import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

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
 *
 * Given a `word`, the word itself is the trigger instead — a game term in a
 * line of rules, marked with a dotted underline (see Term). Its note floats
 * above the page rather than in it: placed beside the word, kept inside the
 * screen, so a word near an edge never widens or lengthens the page and
 * never brings up a scrollbar.
 */
const GLYPH = ['##..###..##', '#......#..#', '#....##...#', '#.........#', '##...#...##'];

/** A short grace before hiding, so the pointer can cross onto the note. */
const HIDE_AFTER_MS = 120;

/** The shared fade-out's length — `--fade-out` in styles.css. */
const FADE_OUT_MS = 260;

export function InfoTip({ label, word, children }: { label: string; word?: ReactNode; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;
  const panelId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<CSSProperties | null>(null);
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

  /*
   * Closing fades the note out with the copy toast's fade rather than cutting
   * it: it stays on screen, marked as leaving, until its animation ends.
   * Pointing back at it mid-fade simply opens it again.
   */
  const wasOpen = useRef(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) setLeaving(false);
    else if (wasOpen.current) setLeaving(true);
    wasOpen.current = open;
  }, [open]);
  // The fade ending normally removes the note. A browser that never runs the
  // animation — a tab in the background, animations switched off — would leave
  // it standing on the page, so a timer removes it as well.
  useEffect(() => {
    if (!leaving) return undefined;
    const done = setTimeout(() => setLeaving(false), FADE_OUT_MS + 100);
    return () => clearTimeout(done);
  }, [leaving]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open, close]);

  // A word's note: under the word, or over it where there is no room below,
  // and slid sideways to stay a gutter inside the screen. Hidden until placed.
  const showing = open || leaving;
  useLayoutEffect(() => {
    if (!word || !showing) {
      setPlaced(null);
      return;
    }
    const trigger = root.current?.getBoundingClientRect();
    const box = panel.current?.getBoundingClientRect();
    if (!trigger || !box) return;
    const gutter = 8;
    const left = Math.min(Math.max(gutter, trigger.left), window.innerWidth - box.width - gutter);
    const below = trigger.bottom + 6;
    const top = below + box.height > window.innerHeight - gutter ? trigger.top - box.height - 6 : below;
    setPlaced({ left: Math.max(gutter, left), top: Math.max(gutter, top) });
  }, [word, showing]);

  const note = (
    <div
      ref={panel}
      className={`infotip__panel ${word ? 'infotip__panel--float' : ''} ${open ? '' : 'is-leaving'}`}
      id={panelId}
      role="note"
      style={word ? (placed ?? { visibility: 'hidden', left: 0, top: 0 }) : undefined}
      onAnimationEnd={() => setLeaving(false)}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') cancelHide();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        hideTimer.current = setTimeout(() => setHovered(false), HIDE_AFTER_MS);
      }}
    >
      {children}
    </div>
  );

  return (
    <span
      className={word ? 'infotip infotip--term' : 'infotip'}
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
        className={word ? 'term' : 'infotip__trigger'}
        aria-label={word ? undefined : label}
        aria-expanded={open}
        aria-controls={panelId}
        onFocus={(event) => setFocused(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocused(false)}
        onClick={() => setPinned((was) => !was)}
      >
        {word ?? (
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
        )}
      </button>
      {showing && (word ? createPortal(note, document.body) : note)}
    </span>
  );
}
