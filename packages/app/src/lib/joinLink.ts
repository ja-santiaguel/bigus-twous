/**
 * Joining a table from a link.
 *
 * Tables are shared as URLs, so the URL is the whole of the joining flow:
 * `?table=AVXLEY` sits you down at that table, and there is no lobby to find
 * first. A link is the smallest thing a person can send to three friends, and
 * anything more than one is a step somebody will get wrong.
 *
 * This reads *what* to join, and nothing about where the server is. Working
 * that out is `serverAddress`'s job and only its job — this file used to
 * answer the same question a second way, defaulted to the page's own origin,
 * and so pointed every shared link at whatever was serving the client rather
 * than at the tables. Two places deciding one thing is how that happens.
 */

export interface JoinLink {
  table: string;
  name?: string;
}

/** Reads a join out of a URL, or null if it is not one. */
export function readJoinLink(href: string): JoinLink | null {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }

  const code = parsed.searchParams.get('table');
  if (!code) return null;
  // A code is read aloud and typed by hand; case is not part of it.
  const table = code.toUpperCase();
  if (!/^[A-Z0-9]{1,16}$/.test(table)) return null;

  const name = parsed.searchParams.get('name')?.slice(0, 24);
  return { table, ...(name ? { name } : {}) };
}

/** Builds the link to share for a table. */
export function joinLinkFor(table: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/?table=${table.toUpperCase()}`;
}
