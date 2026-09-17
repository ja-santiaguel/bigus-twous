/** How close a pointer label may come to the edge of the screen. */
const EDGE_PX = 8;

/**
 * Move a label that follows the pointer to (x, y), kept on screen.
 *
 * The copy toast and the disabled-button hint both hang just above and to the
 * right of the pointer. Near the right edge of a phone — the table code's copy
 * button, the Pass button — that ran the text off the screen. The anchor is
 * placed at the pointer, the label inside it measured, and the anchor slid back
 * by however far the label crosses an edge.
 */
export function followPointer(anchor: HTMLElement, label: HTMLElement | null, x: number, y: number): void {
  anchor.style.transform = `translate(${x}px, ${y}px)`;
  if (!label) return;
  const box = label.getBoundingClientRect();
  const dx = Math.min(0, window.innerWidth - EDGE_PX - box.right) + Math.max(0, EDGE_PX - box.left);
  const dy = Math.max(0, EDGE_PX - box.top) + Math.min(0, window.innerHeight - EDGE_PX - box.bottom);
  if (dx !== 0 || dy !== 0) anchor.style.transform = `translate(${x + dx}px, ${y + dy}px)`;
}
