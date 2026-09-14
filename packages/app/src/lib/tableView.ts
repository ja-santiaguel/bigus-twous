import type { Combo, PlayerId, PlayerView } from '@big-two/engine';

/**
 * Everything the table screen is allowed to render.
 *
 * It takes a `PlayerView` — the redacted, per-seat object the session hands
 * out — and never the full `GameState`. The component tree is therefore
 * physically incapable of drawing an opponent's hand: the data simply is not
 * in the object it receives.
 *
 * This used to take the whole state and redact it here, which put the guarantee
 * one function call away from being an accident. Now the only thing that ever
 * holds four hands is the session, and when that session moves behind a socket
 * this signature does not change at all — the same shape arrives, from further
 * away.
 */

export interface TrickPlay {
  playerId: PlayerId;
  combo: Combo;
  /** True for the combo that currently stands — the one a player has to beat. */
  isActive: boolean;
}

export interface TableView {
  self: PlayerView;
  /**
   * Every combo played in the *current* trick, oldest first.
   *
   * A trick is a rotation: each answer stays on the table beside the one it
   * beat, so you can see the whole exchange rather than just the top card.
   * Only when everyone passes does the trick close and the lot move to the
   * discard pile.
   */
  trickPlays: TrickPlay[];
  /**
   * Cards from *completed* tricks, in the order they were played. Face down,
   * and they stay that way: the pile is drawn from these so it is made of the
   * cards that went into it, but a face-down card renders no identity.
   */
  moundCards: TrickPlay['combo']['cards'];
  moundCount: number;
  /**
   * Identity of the trick in progress — how many tricks have closed before it.
   *
   * The view layer animates the whole trick out as one element when it settles,
   * and needs a key that changes exactly when that happens.
   */
  trickId: number;
  /** Seats that have passed since the active combo was played. */
  passedThisTrick: Set<PlayerId>;
  lastPlayedBy: PlayerId | null;
  isRoundOver: boolean;
  winner: PlayerId | null;
}

export function buildTableView(self: PlayerView): TableView {
  const history = self.history;

  // Everything after the last trick reset belongs to the trick in progress;
  // everything before it has been settled and swept into the pile.
  let resetAt = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.type === 'TRICK_RESET') {
      resetAt = i;
      break;
    }
  }

  const trickPlays: TrickPlay[] = [];
  const moundCards: TrickPlay['combo']['cards'] = [];
  let trickId = 0;
  history.forEach((event, i) => {
    if (event.type === 'TRICK_RESET') trickId += 1;
    if (event.type !== 'CARDS_PLAYED') return;
    if (i > resetAt) trickPlays.push({ playerId: event.playerId, combo: event.combo, isActive: false });
    else moundCards.push(...event.combo.cards);
  });
  const active = trickPlays[trickPlays.length - 1];
  if (active) active.isActive = true;

  // Everyone who has passed out of the trick in progress.
  //
  // The walk stops at the trick reset, not at the last play. Passing forfeits
  // the whole trick (9.7), so a seat that passed stays out even after somebody
  // else answers the pile — stopping at CARDS_PLAYED would quietly drop the
  // "passed" badge off a player the moment anyone played, which is precisely
  // when you most want to see who is still in.
  const passedThisTrick = new Set<PlayerId>();
  for (let i = history.length - 1; i >= 0; i--) {
    const event = history[i]!;
    if (event.type === 'TRICK_RESET') break;
    if (event.type === 'PLAYER_PASSED') passedThisTrick.add(event.playerId);
  }

  /*
   * The last three come from the log rather than from the state object.
   *
   * They used to be read off `GameState` fields that a redacted view does not
   * carry — and they did not need to be. Who played last is the newest play in
   * the trick; whether the round is over, and who won it, is the event that
   * says so. Everything the table draws is therefore derived from what a seat
   * genuinely witnessed, which is the only information a remote client will
   * ever have.
   */
  const ended = [...history].reverse().find((e) => e.type === 'ROUND_ENDED');

  return {
    self,
    trickPlays,
    moundCards,
    moundCount: moundCards.length,
    trickId,
    passedThisTrick,
    lastPlayedBy: trickPlays[trickPlays.length - 1]?.playerId ?? null,
    isRoundOver: ended !== undefined,
    winner: ended?.type === 'ROUND_ENDED' ? ended.winner : null,
  };
}
