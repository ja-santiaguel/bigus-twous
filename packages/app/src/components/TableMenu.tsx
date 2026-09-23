import { useEffect, useId, useRef, useState } from 'react';
import { PixelIcon } from './PixelIcon.js';

/** One entry in the corner menu. */
export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** A way out — leaving, ending — drawn quiet so it never reads as the thing to do. */
  quiet?: boolean;
}

/**
 * The corner menu: one button, top right, on every screen that is played
 * rather than set up — every table, at every width, and the campaign between
 * tables — so it is always in the same place. What is in it depends on the
 * screen: How to play and Leave table at a table; the main menu and ending a
 * run in the campaign. None of it is needed during a turn, so it stays behind
 * one button rather than taking room on the board.
 */
export function TableMenu({ items }: { items: MenuItem[] }) {
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
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        <PixelIcon name="menu" />
      </button>
      {open && (
        <div className="tablemenu__panel" id={panelId}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={item.quiet ? 'btn btn--quiet' : 'btn'}
              onClick={choose(item.onSelect)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
