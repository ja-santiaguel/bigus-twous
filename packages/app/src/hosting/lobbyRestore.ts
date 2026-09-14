import type { LobbySnapshot } from '@big-two/server/table';

/**
 * Keeping a hosted lobby across a reload (9.18).
 *
 * The host's page keeps a copy of its lobby — seats, names, tokens, settings —
 * in this tab's session storage, which a reload and a reopened tab keep and a
 * new tab does not. Coming back within a minute reopens the same table, and
 * the other players, whose devices have been waiting, sit straight back down.
 *
 * Only a lobby. Once cards are dealt the table is hands, scores and a sealed
 * shuffle, and a copy of those in the host's page is not something the other
 * players could trust to come back unchanged.
 *
 * Kept apart from the hosting code so the store can check for a lobby to
 * reopen without loading PeerJS for everyone who opens the page.
 */

const KEY = 'bigtwo:hosting';

/** How long a lobby waits for its host to come back, on both ends. */
export const HOST_RETURN_MS = 60_000;

interface Saved {
  savedAt: number;
  snapshot: LobbySnapshot;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveHostedLobby(snapshot: LobbySnapshot): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ savedAt: Date.now(), snapshot } satisfies Saved));
  } catch {
    /* storage full or disabled; a reload will simply not bring the lobby back */
  }
}

export function clearHostedLobby(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The lobby this tab was hosting, if it went away recently enough to reopen. Taken, so it is only ever reopened once. */
export function takeHostedLobby(now = Date.now()): LobbySnapshot | null {
  let saved: Partial<Saved> | null = null;
  try {
    const raw = storage()?.getItem(KEY);
    saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
  } catch {
    saved = null;
  }
  clearHostedLobby();
  if (!saved?.snapshot || typeof saved.savedAt !== 'number') return null;
  if (saved.snapshot.version !== 1 || typeof saved.snapshot.code !== 'string') return null;
  if (now - saved.savedAt > HOST_RETURN_MS) return null;
  return saved.snapshot;
}
