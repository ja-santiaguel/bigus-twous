import { useCallback, useRef, useState } from 'react';
import { cardInColumn, classifyTouch, nearestCentre, scrubSelection } from './handGestures.js';
import type { Rect } from './zoneGeometry.js';

/**
 * Dragging cards, once for the whole table.
 *
 * Every card lives in one layer and one coordinate space, so there is one
 * gesture implementation rather than one per zone. Where a drag ends is a
 * point-in-box test against the measured zones; what that means is a single
 * switch.
 *
 * With a mouse, one gesture and its outcomes, decided when you let go:
 *   released over the table → play the cards, if the play is legal
 *   released over the hand  → drop into the nearest slot
 *   released anywhere else  → nothing; the cards travel home
 *   never actually moved    → a click, which selects
 *
 * With a finger, the press itself is read first (see `handGestures`): a tap
 * picks the card under it, a slide along the hand picks every card it passes,
 * and a push upward lifts the selection to play on the table. The card under
 * the finger is shown enlarged throughout, because the finger is covering it.
 * There is no reordering by finger — a crowded hand makes that a misfire more
 * often than a choice, and the sort button does it in one tap.
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
  /** The card under a finger pressing the hand, shown enlarged because the finger hides it. */
  previewId: string | null;
}

const IDLE: TableDragState = {
  grabbedId: null,
  draggingIds: [],
  dx: 0,
  dy: 0,
  over: null,
  targetIndex: 0,
  previewId: null,
};

export interface TableDragActions {
  onReorder(id: string, toIndex: number): void;
  onPlay(ids: string[]): void;
  onTap(id: string): void;
  /** Replace the selection outright — a finger sliding along the hand. */
  onSelect(ids: string[]): void;
}

/** A finger on the hand, while it decides what it is doing. */
interface TouchPress {
  mode: 'pending' | 'scrub' | 'lift';
  /** The card the finger came down on. */
  startId: string;
  /** What was picked when the finger came down. */
  baseline: Set<string>;
  /** Whether sliding picks cards up (the first was not picked) or puts them back. */
  select: boolean;
  visited: Set<string>;
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
  cardBox,
  hoveredId = null,
}: {
  /** The two zones a drag can end in. */
  zones: { hand: Rect | null; trick: Rect | null };
  /** Ordered ids in your hand, for working out where a drop lands. */
  handIds: string[];
  /** The cards you have picked out. Grabbing one of them carries all of them. */
  selectedIds: Set<string>;
  actions: TableDragActions;
  /** A card's centre and left edge in the viewport, by id — for drop indexes and finger hit-tests. */
  cardBox: (id: string) => { x: number; y: number; left: number } | null;
  /** The card a mouse is hovering, which a press on the hand takes. */
  hoveredId?: string | null;
}): [
  TableDragState,
  {
    onPointerDown(e: React.PointerEvent, id: string): void;
    onPointerMove(e: React.PointerEvent): void;
    onPointerUp(e: React.PointerEvent, id: string): void;
    onPointerCancel(e: React.PointerEvent): void;
    /**
     * The hand card a mouse at this x is over, by nearest centreline. Given the
     * card already hovered, that card keeps it a few pixels past the boundary.
     */
    cardAt(x: number, current?: string | null): string | null;
  },
] {
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
  const touch = useRef<TouchPress | null>(null);
  /** The card a mouse press picked, by column, which may not be the element it landed on. */
  const pressed = useRef<string | null>(null);

  const commit = useCallback((next: TableDragState) => {
    live.current = next;
    setState(next);
  }, []);

  /** The card whose visible strip is under a finger at this x: a fingertip covers the rest of it. */
  const cardUnder = useCallback(
    (x: number) =>
      cardInColumn(
        x,
        handIds.flatMap((id) => {
          const box = cardBox(id);
          return box ? [{ id, left: box.left }] : [];
        }),
      ),
    [cardBox, handIds],
  );

  /** The card a mouse is over, by nearest centreline, the hovered one keeping a little give. */
  const cardAt = useCallback(
    (x: number, current: string | null = null) =>
      nearestCentre(
        x,
        handIds.flatMap((id) => {
          const box = cardBox(id);
          return box ? [{ id, centre: box.x }] : [];
        }),
        current,
      ),
    [cardBox, handIds],
  );

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

      if (event.pointerType !== 'mouse') {
        const startId = cardUnder(event.clientX) ?? id;
        touch.current = {
          mode: 'pending',
          startId,
          baseline: new Set(selectedIds),
          select: !selectedIds.has(startId),
          visited: new Set([startId]),
        };
        commit({ ...IDLE, previewId: startId });
        return;
      }

      touch.current = null;
      // By column, as a finger is: a hovered card grows over the strip of the
      // one to its right, and pressing that strip means the card it belongs to.
      const target = handIds.includes(id) ? (cardAt(event.clientX, hoveredId) ?? id) : id;
      pressed.current = target;
      // Grabbing a selected card drags the whole selection, so a combo you
      // have picked out moves as one thing.
      const group = selectedIds.has(target) ? handIds.filter((x) => selectedIds.has(x)) : [target];
      commit({ ...IDLE, grabbedId: target, draggingIds: group.length > 0 ? group : [target] });
    },
    [cardAt, cardUnder, commit, handIds, hoveredId, selectedIds],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!active.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;

      const press = touch.current;
      if (press) {
        if (press.mode === 'pending') {
          const gesture = classifyTouch(dx, dy);
          if (gesture === 'pending') return;
          press.mode = gesture;
          moved.current = true;
          if (gesture === 'scrub') {
            actions.onSelect(scrubSelection(handIds, press.baseline, press.visited, press.select));
          } else {
            // Lifting a picked card lifts every picked card; an unpicked one goes alone.
            const group = press.baseline.has(press.startId)
              ? handIds.filter((x) => press.baseline.has(x))
              : [press.startId];
            live.current = { ...IDLE, grabbedId: press.startId, draggingIds: group };
          }
        }
        if (press.mode === 'scrub') {
          const id = cardUnder(event.clientX);
          if (!id) return;
          if (!press.visited.has(id)) {
            press.visited.add(id);
            actions.onSelect(scrubSelection(handIds, press.baseline, press.visited, press.select));
          }
          if (live.current.previewId !== id) commit({ ...IDLE, previewId: id });
          return;
        }
        // A lift carries on as an ordinary drag below.
      } else {
        if (!moved.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        moved.current = true;
      }

      const { clientX: x, clientY: y } = event;
      // The table is an exact target; the hand is forgiving.
      const over: DropZone = inside(zones.trick, x, y)
        ? 'trick'
        : !press && inside(zones.hand, x, y, NEAR_HAND_PX)
          ? 'hand'
          : null;

      // How many cards the pointer has passed — the drop index.
      const moving = new Set(live.current.draggingIds);
      let targetIndex = 0;
      for (const id of handIds) {
        if (moving.has(id)) continue;
        const box = cardBox(id);
        if (box && box.x < x) targetIndex += 1;
      }

      commit({ ...live.current, dx, dy, over, targetIndex });
    },
    [actions, cardBox, cardUnder, commit, handIds, zones],
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

      const press = touch.current;
      touch.current = null;
      const target = pressed.current ?? id;
      pressed.current = null;
      const wasMoved = moved.current;
      const { draggingIds, over, targetIndex } = live.current;
      moved.current = false;
      const group = draggingIds.length > 0 ? draggingIds : [target];

      // Clearing the drag is what sends the cards home: their placement
      // resolves to a resting transform again and they travel back.
      commit(IDLE);

      if (press) {
        if (press.mode === 'pending') actions.onTap(press.startId);
        else if (press.mode === 'lift' && over === 'trick') actions.onPlay(group);
        // A slide has already made its selection as it went.
        return;
      }

      if (!wasMoved) {
        actions.onTap(target);
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
        actions.onReorder(target, targetIndex);
      }
    },
    [actions, commit],
  );

  /** The browser took the pointer away. Nothing happens; the cards go home. */
  const onPointerCancel = useCallback(() => {
    active.current = false;
    moved.current = false;
    touch.current = null;
    pressed.current = null;
    commit(IDLE);
  }, [commit]);

  return [state, { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, cardAt }];
}
