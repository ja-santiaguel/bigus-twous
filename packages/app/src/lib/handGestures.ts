/**
 * Touch gestures on your hand, as pure decisions.
 *
 * A finger is not a mouse. It covers what it presses, it is never perfectly
 * still, and on a phone thirteen cards leave each one a strip about a
 * fingertip's width. So a finger on the hand means one of three things, told
 * apart by how it moves:
 *
 *   hardly moves     → a tap: pick the card up or put it back
 *   slides sideways  → a sweep along the hand: every card passed over is picked
 *                      (or, if the first was already picked, put back)
 *   pushes upward    → lift the cards toward the table, to play them
 *
 * The same decisions sit behind every successful card game on a phone — a
 * slide to gather a run of cards, a push up to play them — and keeping them
 * here, apart from any event handling, is what lets them be tested.
 */

/** How far a finger travels before a press becomes a gesture. Wider than a mouse's: a fingertip is never still. */
export const TOUCH_SLOP_PX = 10;

export type TouchGesture = 'pending' | 'scrub' | 'lift';

/** What a finger that has moved (dx, dy) from where it pressed is doing. */
export function classifyTouch(dx: number, dy: number, slop = TOUCH_SLOP_PX): TouchGesture {
  if (Math.hypot(dx, dy) < slop) return 'pending';
  // Upward, and more up than sideways: lifting the cards toward the table.
  if (dy < 0 && -dy > Math.abs(dx)) return 'lift';
  return 'scrub';
}

/**
 * The card whose column a point falls in.
 *
 * Cards in a hand overlap left to right, each on top of the one before, so
 * what you see at a point is the last card whose left edge is at or before it.
 * Hit-testing that way — rather than by the nearest card centre, which sits
 * half a card to the right of the strip you can actually see — means the card
 * a finger lands on is the card it looks like it landed on.
 */
export function cardInColumn(x: number, cards: { id: string; left: number }[]): string | null {
  if (cards.length === 0) return null;
  const sorted = [...cards].sort((a, b) => a.left - b.left);
  let hit = sorted[0]!.id;
  for (const card of sorted) {
    if (card.left <= x) hit = card.id;
    else break;
  }
  return hit;
}

/** The give a hovered card has past the boundary with its neighbour, at most. */
export const HOVER_PADDING_PX = 4;

/**
 * The card a mouse is over: the one whose centreline is nearest, with a little
 * give for the card already hovered.
 *
 * The boundary between two cards sits halfway between their centres, so every
 * card owns an equal zone either side of its own centreline — however much of
 * it is covered, and however much a hovered card has grown over its
 * neighbours. The hovered card keeps the hover until the pointer is `padding`
 * past a boundary (less where cards are packed tightly: a quarter of the
 * distance between centres), so a pointer resting on a boundary does not
 * flick between the two cards.
 */
export function nearestCentre(
  x: number,
  cards: { id: string; centre: number }[],
  current: string | null,
  padding = HOVER_PADDING_PX,
): string | null {
  if (cards.length === 0) return null;
  const sorted = [...cards].sort((a, b) => a.centre - b.centre);
  let nearest = sorted[0]!;
  for (const card of sorted) {
    if (Math.abs(x - card.centre) < Math.abs(x - nearest.centre)) nearest = card;
  }
  if (!current || nearest.id === current) return nearest.id;
  const at = sorted.findIndex((card) => card.id === current);
  if (at < 0) return nearest.id;
  const here = sorted[at]!;
  const previous = sorted[at - 1];
  const next = sorted[at + 1];
  const low = previous
    ? (previous.centre + here.centre) / 2 - Math.min(padding, (here.centre - previous.centre) / 4)
    : -Infinity;
  const high = next ? (here.centre + next.centre) / 2 + Math.min(padding, (next.centre - here.centre) / 4) : Infinity;
  return x >= low && x < high ? current : nearest.id;
}

/**
 * The selection after sliding over `visited`: those cards all picked (or all
 * put back), everything else as it was, in hand order.
 */
export function scrubSelection(
  order: string[],
  baseline: ReadonlySet<string>,
  visited: ReadonlySet<string>,
  select: boolean,
): string[] {
  return order.filter((id) => (visited.has(id) ? select : baseline.has(id)));
}
