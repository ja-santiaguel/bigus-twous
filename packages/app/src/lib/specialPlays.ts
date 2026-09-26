import type { PassiveReady } from '../components/table/CardLayer.js';

/** One nudge, start to finish (styles.css: passive-nudge). */
export const NUDGE_MS = 2600;
/** How far apart separate one-card plays nudge, left to right. */
export const NUDGE_RIPPLE_MS = 110;

/**
 * Which cards in your hand make a special play now, and how each shows it.
 *
 * Every play — a class play, or one a Medallion allows — is named once, over
 * its left-most card; a card in more than one play carries a count, and names
 * them all on point.
 *
 * The nudge keeps one shared clock: a card's phase is fixed the first time it
 * is ready, as an offset back to the clock's last beat, so every ready card
 * moves in time with every other however long each has been showing. The
 * cards of a play of several move as one; plays of one card each ripple left
 * to right, a beat of NUDGE_RIPPLE_MS apart.
 */
export function specialPlays(
  plays: { cards: string[]; name: string }[],
  classId: string,
  handOrder: string[],
  phases: Map<string, number>,
  now: number = performance.now(),
): Map<string, PassiveReady> {
  const at = (id: string) => {
    const i = handOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const leftmost = (cards: string[]) => cards.reduce((a, b) => (at(b) < at(a) ? b : a));
  const ordered = [...plays].sort((a, b) => at(leftmost(a.cards)) - at(leftmost(b.cards)));
  // A card in any play of several moves with it, never on a ripple of its own.
  const together = new Set(plays.flatMap((p) => (p.cards.length > 1 ? p.cards : [])));
  const singles = [
    ...new Set(ordered.flatMap((p) => (p.cards.length === 1 && !together.has(p.cards[0]!) ? p.cards : []))),
  ];

  const out = new Map<string, PassiveReady>();
  const named = new Set<string>();
  for (const play of ordered) {
    // Each named play labels its left-most card, once however many ways it can be made.
    const lead = leftmost(play.cards);
    const tagHere = !named.has(play.name);
    named.add(play.name);
    for (const id of play.cards) {
      if (!phases.has(id)) phases.set(id, -(now % NUDGE_MS));
      const seen = out.get(id);
      if (seen) {
        if (!seen.plays.includes(play.name)) seen.plays.push(play.name);
        if (tagHere && id === lead && !seen.tag) seen.tag = play.name;
        continue;
      }
      const ripple = Math.max(0, singles.indexOf(id));
      out.set(id, {
        classId,
        delayMs: phases.get(id)! + ripple * NUDGE_RIPPLE_MS,
        tag: tagHere && id === lead ? play.name : undefined,
        plays: [play.name],
      });
    }
  }
  // A card no longer ready starts its clock afresh when it is next.
  for (const id of [...phases.keys()]) if (!out.has(id)) phases.delete(id);
  return out;
}
