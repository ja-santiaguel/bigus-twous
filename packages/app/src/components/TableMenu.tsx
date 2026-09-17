import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * The table's menu, on a phone.
 *
 * On a wide screen the round, the seed or table code, How to play and Leave
 * table each have room of their own. On a phone they wrapped into a five-line
 * block under the hand that pushed the table past the bottom of the screen, and
 * none of them is needed during a turn. So they live here, behind one button in
 * the corner — the same corner as How to play on a wide screen.
 */
export function TableMenu({
  info,
  onRules,
  onLeave,
}: {
  /** What this game is: the round, the match, and a code or seed to copy. */
  info: ReactNode;
  onRules: () => void;
  onLeave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="tablemenu" ref={root}>
      <button
        type="button"
        className="tablemenu__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        Menu
      </button>
      {open && (
        <div className="tablemenu__panel" id={panelId}>
          <p className="tablemenu__info">{info}</p>
          <button type="button" className="btn" onClick={choose(onRules)}>
            How to play
          </button>
          <button type="button" className="btn btn--quiet" onClick={choose(onLeave)}>
            Leave table
          </button>
        </div>
      )}
    </div>
  );
}
