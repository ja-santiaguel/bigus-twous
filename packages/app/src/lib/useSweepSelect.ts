import { useCallback, useRef, useState } from 'react';

/**
 * Sweep-selection, for the whole table rather than for one zone.
 *
 * Drag a box across empty felt and every card it touches joins the selection.
 * It used to live on the hand, which meant the gesture stopped existing the
 * moment the pointer left the fan — and since the cards are no longer children
 * of the fan anyway, there was nothing left tying the gesture to that one box.
 *
 * **Additive.** A sweep adds to what you had already picked; it never clears
 * it. That is what lets you gather a combo from two separate runs of a fan,
 * which is most of the reason to sweep at all. Within a single sweep the box
 * is still live in both directions — drag back over a card and it drops out
 * again — because the baseline is snapshotted when the gesture starts and the
 * result is that baseline plus whatever the box currently covers. So a sweep
 * can always undo its own work, and never anybody else's.
 *
 * Hit-testing is against the card layer's live cards, in viewport coordinates,
 * so the same rectangle overlap works no matter which surface the sweep
 * started on.
 */

export interface SweepBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Things a press should mean something else on. A sweep is the gesture of
 * last resort: it starts only where nothing else claims the press.
 */
const INTERACTIVE = '.cardlayer__card, button, a, input, select, textarea, [role="button"]';

/** Below this a press is a click, not a drag, and marking on it would be noise. */
const SWEEP_THRESHOLD_PX = 5;

export function useSweepSelect({
  enabled,
  selectedIds,
  onSelect,
}: {
  enabled: boolean;
  /** What is already picked. Snapshotted when a sweep starts, never cleared by one. */
  selectedIds: string[];
  /** The new selection: the baseline plus whatever the box covers right now. */
  onSelect: (ids: string[]) => void;
}): [
  SweepBox | null,
  {
    onPointerDown(e: React.PointerEvent<HTMLElement>): void;
    onPointerMove(e: React.PointerEvent<HTMLElement>): void;
    onPointerUp(e: React.PointerEvent<HTMLElement>): void;
    onPointerCancel(e: React.PointerEvent<HTMLElement>): void;
  },
] {
  const [sweep, setSweep] = useState<SweepBox | null>(null);
  /** Read synchronously during a move: a flick can land before a re-render. */
  const live = useRef<SweepBox | null>(null);
  /** Origin in viewport space, so hit tests never depend on the surface. */
  const origin = useRef({ x: 0, y: 0 });
  const passed = useRef(false);
  /** What was selected when this sweep began — the floor it can never go below. */
  const baseline = useRef<string[]>([]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const target = event.target as HTMLElement | null;
      // Shift sweeps from anywhere, including from on top of a card — the one
      // way to start a box inside a fan packed edge to edge.
      if (!event.shiftKey && target?.closest(INTERACTIVE)) return;

      const rect = event.currentTarget.getBoundingClientRect();
      origin.current = { x: event.clientX, y: event.clientY };
      passed.current = false;
      baseline.current = selectedIds;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* capture is an optimisation; the sweep still works without it */
      }
      const box = {
        x0: event.clientX - rect.left,
        y0: event.clientY - rect.top,
        x1: event.clientX - rect.left,
        y1: event.clientY - rect.top,
      };
      live.current = box;
      setSweep(box);
    },
    [enabled, selectedIds],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!live.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const next = { ...live.current, x1: event.clientX - rect.left, y1: event.clientY - rect.top };
      live.current = next;
      setSweep(next);

      if (
        !passed.current &&
        Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) < SWEEP_THRESHOLD_PX
      ) {
        return;
      }
      passed.current = true;

      const box = {
        left: Math.min(origin.current.x, event.clientX),
        right: Math.max(origin.current.x, event.clientX),
        top: Math.min(origin.current.y, event.clientY),
        bottom: Math.max(origin.current.y, event.clientY),
      };
      // The baseline keeps its own order — those cards were picked in a
      // particular sequence and a sweep somewhere else has no business
      // rearranging them. The box's own hits follow, in the order the cards
      // sit in the fan.
      const chosen = [...baseline.current];
      const have = new Set(chosen);
      for (const element of document.querySelectorAll<HTMLElement>('.cardlayer__card.is-live')) {
        const r = element.getBoundingClientRect();
        // A sweep dragged dead straight has no height, so the vertical test
        // gets a pixel of slack — otherwise a perfectly horizontal drag
        // selects nothing at all.
        const overlaps = r.left < box.right && r.right > box.left && r.top < box.bottom + 1 && r.bottom > box.top - 1;
        const id = element.dataset.id;
        if (overlaps && id && !have.has(id)) {
          have.add(id);
          chosen.push(id);
        }
      }
      onSelect(chosen);
    },
    [onSelect],
  );

  const end = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Releases from gestures that never started a sweep — a tap on a card,
      // a drag of one — bubble up here too. They are not ours to act on.
      if (!live.current) return;
      // A press on empty felt that never became a drag is a click on nothing,
      // and a click on nothing deselects — the same thing it means in every
      // list and canvas people already use. It has to happen here on release
      // rather than on press, or it would wipe the baseline out from under
      // the sweep that was just starting.
      if (!passed.current) onSelect([]);
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        /* already gone */
      }
      live.current = null;
      passed.current = false;
      setSweep(null);
    },
    [onSelect],
  );

  return [sweep, { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }];
}

/** The marquee's box in the coordinate space of the surface it was drawn on. */
export function sweepStyle(b: SweepBox): React.CSSProperties {
  return {
    left: Math.min(b.x0, b.x1),
    top: Math.min(b.y0, b.y1),
    width: Math.abs(b.x1 - b.x0),
    height: Math.abs(b.y1 - b.y0),
  };
}
