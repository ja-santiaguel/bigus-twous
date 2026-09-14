/**
 * Whose turn it is.
 *
 * One marker, used by every seat including your own. It is always drawn, so a
 * name never shifts sideways as the turn moves round the table — what changes
 * is the marker's state, not whether there is one.
 *
 * At rest it is a dim square that reads as punctuation. On turn it grows,
 * fills gold, gains a ring and blinks: four changes at once, because this is
 * the single thing on the board a player most often wants to find at a glance.
 * Your own turn used to be announced only in words at the bottom of the
 * screen, which meant the most important state on the table was the one state
 * with no mark on it.
 */
export function TurnDot({ on }: { on: boolean }) {
  return <span className={`turndot ${on ? 'is-on' : ''}`} aria-hidden="true" />;
}
