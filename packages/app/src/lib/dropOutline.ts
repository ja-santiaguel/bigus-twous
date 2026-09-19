/**
 * How far the drop area's outline has to come in from each side of its box to
 * stay clear of everything around it.
 *
 * The drop area is the whole middle band of the table, and on a wide screen
 * that band runs up under the top seat's card count and beside the side seats'
 * names. Drawn over its full box, the lit outline crossed them. The *hit area*
 * stays the whole band — a drop is aimed by a hand in motion — but the outline
 * is pulled in until nothing else sits inside it.
 *
 * Each overlapping neighbour is cut away from whichever side loses the least of
 * the box: the top seat, which spans the band, takes a sliver off the top
 * rather than a side off the whole thing.
 */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Clearance {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function clearOf(area: Box, neighbours: Box[]): Clearance {
  const inner = { ...area };
  for (const n of neighbours) {
    const overlaps = n.left < inner.right && n.right > inner.left && n.top < inner.bottom && n.bottom > inner.top;
    if (!overlaps) continue;
    const width = inner.right - inner.left;
    const height = inner.bottom - inner.top;
    // The area each cut would leave, largest first.
    const cuts: [keyof Box, number, number][] = [
      ['top', n.bottom, (inner.bottom - n.bottom) * width],
      ['bottom', n.top, (n.top - inner.top) * width],
      ['left', n.right, (inner.right - n.right) * height],
      ['right', n.left, (n.left - inner.left) * height],
    ];
    cuts.sort((a, b) => b[2] - a[2]);
    const [side, edge] = cuts[0]!;
    inner[side] = edge;
  }
  return {
    top: Math.max(0, inner.top - area.top),
    right: Math.max(0, area.right - inner.right),
    bottom: Math.max(0, area.bottom - inner.bottom),
    left: Math.max(0, inner.left - area.left),
  };
}
