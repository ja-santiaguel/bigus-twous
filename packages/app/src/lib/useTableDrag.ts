import { useCallback, useRef, useState } from 'react';
import type { Rect } from './zoneGeometry.js';

/**
 * Dragging cards, once for the whole table.
 *
 * Every card lives in one layer and one coordinate space, so there is one
 * gesture implementation rather than one per zone. Where a drag ends is a
 * point-in-box test against the measured zones; what that means is a single
 * switch. Previously the fan and the tray each had their own drag, their own
 * idea of a drop target and their own bugs, and a card crossing between them
 * had to be faked at both ends.
 *
 * One gesture, three outcomes, decided when you let go:
 *   released over the table → play the cards, if the play is legal
 *   released over the hand  → drop into the nearest slot
 *   released anywhere else  → nothing; the cards travel home
 *   never actually moved    → a tap, which selects
 *
 * There is no third destination any more. A holding tray used to sit between
 * the hand and the table, so playing a card meant two gestures and a card had
 * three places it could be. Dropping cards straight onto the table is the
 * gesture people reach for anyway, and removing the middle step removed the
 * whole class of "which zone is this card in" bugs with it.
 */

const DRAG_THRESHOLD_PX = 6;

/**
 * How far outside the hand still counts as "dropped on the hand".
 *
 * People release a little high or a little wide when they are aiming at the
 * gap between two cards rather than at a card. Demanding pixel accuracy turns
 * an ordinary reorder into a retry.
 */
const NEAR_HAND_PX = 56;

export type DropZone = 'hand' | 'trick' | null;

export interface TableDragState {
  /** The card under the pointer, or null when nothing is being dragged. */
  grabbedId: string | null;
  /** Every card travelling — the whole selection when the grabbed card is in it. */
  draggingIds: string[];
  dx: number;
  dy: number;
  /** Where the cards would go if released right now. */
  over: DropZone;
  /** Index in the hand the grabbed card would land on. */
  targetIndex: number;
}

const IDLE: TableDragState = { grabbedId: null, draggingIds: [], dx: 0, dy: 0, over: null, targetIndex: 0 };

export interface TableDragActions {
  onReorder(id: string, toIndex: number): void;
  onPlay(ids: string[]): void;
  onTap(id: string): void;
}

function inside(rect: Rect | null | undefined, x: number, y: number, pad = 0): boolean {
  if (!rect) return false;
  return x >= rect.x - pad && x <= rect.x + rect.width + pad && y >= rect.y - pad && y <= rect.y + rect.height + pad;
}

export function useTableDrag({
  zones,
  handIds,
  selectedIds,
  actions,
  cardCentre,
}: {
  /** The two zones a drag can end in. */
  zones: { hand: Rect | null; trick: Rect | null };
  /** Ordered ids in your hand, for working out where a drop lands. */
  handIds: string[];
  /** The cards you have picked out. Grabbing one of them carries all of them. */
  selectedIds: Set<string>;
  actions: TableDragActions;
  /** Viewport centre of a card, by id — used to find the drop index. */
  cardCentre: (id: string) => { x: number; y: number } | null;
}): [TableDragState, { onPointerDown(e: React.PointerEvent, id: string): void; onPointerMove(e: React.PointerEvent): void; onPointerUp(e: React.PointerEvent, id: string): void }] {
  const [state, setState] = useState<TableDragState>(IDLE);

  /**
   * The authoritative drag data, mirrored into state only so the view can
   * render it. The decision at pointerup must not be read from React state: a
   * quick flick dispatches pointerdown, its moves and pointerup inside one
   * batch, so no re-render happens in between and the handler would still see
   * the initial state. Refs update synchronously.
   */
  const live = useRef<TableDragState>(IDLE);
  const start = useRef({ x: 0, y: 0, index: 0 });
  const moved = useRef(false);
  const active = useRef(false);

  const commit = useCallback((next: TableDragState) => {
    live.current = next;
    setState(next);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent, id: string) => {
      // Shift means "sweep-select", which the zone surfaces handle. Bowing out
      // without capturing the pointer lets the event reach them.
      if (event.shiftKey) return;
      start.current = { x: event.clientX, y: event.clientY, index: handIds.indexOf(id) };
      moved.current = false;
      active.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* capture is an optimisation, not a requirement */
      }
      // Grabbing a selected card drags the whole selection, so a combo you
      // have picked out moves as one thing.
      const group = selectedIds.has(id) ? handIds.filter((x) => selectedIds.has(x)) : [id];
      commit({ ...IDLE, grabbedId: id, draggingIds: group.length > 0 ? group : [id] });
    },
    [commit, handIds, selectedIds],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!active.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (!moved.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      moved.current = true;

      const { clientX: x, clientY: y } = event;
      // The table is an exact target; the hand is forgiving.
      const over: DropZone = inside(zones.trick, x, y)
        ? 'trick'
        : inside(zones.hand, x, y, NEAR_HAND_PX)
          ? 'hand'
          : null;

      // How many cards the pointer has passed — the drop index.
      const moving = new Set(live.current.draggingIds);
      let targetIndex = 0;
      for (const id of handIds) {
        if (moving.has(id)) continue;
        const centre = cardCentre(id);
        if (centre && centre.x < x) targetIndex += 1;
      }

      commit({ ...live.current, dx, dy, over, targetIndex });
    },
    [cardCentre, commit, handIds, zones],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent, id: string) => {
      if (!active.current) return;
      active.current = false;
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        /* already released, or the pointer is gone */
      }

      const wasMoved = moved.current;
      const { draggingIds, over, targetIndex } = live.current;
      moved.current = false;
      const group = draggingIds.length > 0 ? draggingIds : [id];

      // Clearing the drag is what sends the cards home: their placement
      // resolves to a resting transform again and they travel back.
      commit(IDLE);

      if (!wasMoved) {
        actions.onTap(id);
        return;
      }
      if (over === 'trick') {
        actions.onPlay(group);
        return;
      }
      if (over === 'hand') {
        // No off-by-one correction needed: the cards being dragged are skipped
        // when counting, so the index already describes where they land in the
        // list without them.
        actions.onReorder(id, targetIndex);
      }
    },
    [actions, commit],
  );

  return [state, { onPointerDown, onPointerMove, onPointerUp }];
}
