/**
 * Where the table server lives.
 *
 * Resolved rather than configured, in three steps, so that the common cases
 * need no configuration at all:
 *
 *  1. `?server=` on the URL, which is how you point a client at somebody
 *     else's machine without rebuilding it.
 *  2. `VITE_TABLE_SERVER` at build time, which is how development works: the
 *     client is served by Vite on one port and the tables run on another.
 *  3. The page's own origin, which is how a deployment works: one process
 *     serves the client and runs the tables, so there is nothing to point at.
 *
 * The third case is the reason this is worth a file. A build that has to be
 * told its own address is a build that can be deployed wrong, and the failure
 * — a client that loads perfectly and then cannot reach a table — looks like a
 * server problem rather than a configuration one.
 */

function configured(): string | null {
  try {
    const fromUrl = new URL(window.location.href).searchParams.get('server');
    if (fromUrl) return fromUrl;
  } catch {
    /* not a browser, or not a URL — fall through */
  }
  const fromBuild = import.meta.env?.VITE_TABLE_SERVER;
  return typeof fromBuild === 'string' && fromBuild.length > 0 ? fromBuild : null;
}

const trim = (url: string) => url.replace(/\/+$/, '');

/** Base address for ordinary requests, e.g. opening a table. */
export function httpBase(): string {
  const explicit = configured();
  if (explicit) return trim(explicit.replace(/^ws(s?):/, 'http$1:'));
  return trim(window.location.origin);
}

/**
 * Base address for sockets.
 *
 * `wss` from an `https` page, always. A browser refuses an insecure socket
 * from a secure page, and that refusal only shows up once the thing is
 * deployed — which is the worst moment to discover it.
 */
export function socketBase(): string {
  const explicit = configured();
  if (explicit) return trim(explicit.replace(/^http(s?):/, 'ws$1:'));
  const page = new URL(window.location.href);
  return `${page.protocol === 'https:' ? 'wss:' : 'ws:'}//${page.host}`;
}

/** The socket address for one table. */
export function tableSocket(code: string): string {
  return `${socketBase()}/table/${code.toUpperCase()}`;
}

/**
 * Who runs a shared table.
 *
 * A player's browser by default: the client is then all a deployment needs, and
 * static hosting is free. A table server when this build says so
 * (`VITE_HOSTING=server`) or the URL points at one (`?server=`) — the option for
 * a table nobody at it can look inside (9.18).
 */
export function hostingMode(): 'browser' | 'server' {
  try {
    if (new URL(window.location.href).searchParams.get('server')) return 'server';
  } catch {
    /* not a browser — fall through */
  }
  return import.meta.env?.VITE_HOSTING === 'server' ? 'server' : 'browser';
}
