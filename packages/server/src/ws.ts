import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createGzip } from 'node:zlib';
import { WebSocketServer, type WebSocket } from 'ws';
import { decodeClient, encodeServer } from '@big-two/protocol';
import type { Connection } from './table.js';
import { TableRegistry, type RegistryOptions } from './tables.js';

/**
 * The transport adapter.
 *
 * Everything that knows about sockets is in this file, and it is short on
 * purpose — the table logic underneath deals in "something that can be sent a
 * string", so moving to a different runtime later means rewriting this and
 * nothing else. The hosting decision is still open; this is the version that
 * runs on a plain Node process, which is the one that needs no platform.
 *
 * What lives here and nowhere else: accepting a socket, reading the table code
 * off the URL, decoding bytes, noticing when a connection has gone quiet — and
 * the limits that stop one visitor from spending the server on everybody
 * else. The endpoint is public by design (a link is not a secret), so every
 * one of those limits is a default, not an option somebody has to remember.
 */

export interface ServeOptions extends RegistryOptions {
  port?: number;
  /**
   * Directory of built client files to serve, if this process should serve
   * them.
   *
   * One process serving both is the simplest deployment there is, and it makes
   * the client's address resolution trivial: the tables are wherever the page
   * came from, so nothing has to be configured and nothing can be configured
   * wrongly. In development the client is served by Vite instead and this is
   * left unset.
   */
  clientDir?: string;
  /**
   * Origins other than this server's own that may open tables and sockets.
   *
   * Empty by default: a page served from this process is same-origin and
   * needs no entry, and a page on some other site has no business opening
   * tables here. Development lists Vite's address (see `main.ts`). `'*'`
   * allows anyone, and exists for tests and nothing else.
   */
  allowOrigins?: string[];
  /**
   * How long a socket may go without answering a ping before it is treated as
   * gone. A closed laptop lid does not send a close frame, so without this a
   * table waits forever on somebody who is not coming back — which is exactly
   * the state the CPU handover exists to avoid.
   */
  heartbeatMs?: number;
  /** Most tables open at once. Each is a live game with timers; memory is finite. */
  maxTables?: number;
  /** Most tables one address may open per minute. A person opens one; a loop opens thousands. */
  tablesPerMinute?: number;
  /** Largest frame accepted, in bytes. A move is a few hundred; a hand is under two thousand. */
  maxMessageBytes?: number;
  /** Most messages one connection may send per second before it is cut off. */
  messagesPerSecond?: number;
  /**
   * Read the client address from `X-Forwarded-For`. Only behind a proxy that
   * sets it — anywhere else the header is whatever the client wrote, and a
   * rate limit keyed on it is no limit at all.
   */
  trustProxy?: boolean;
}

export interface RunningServer {
  readonly port: number;
  readonly registry: TableRegistry;
  close(): Promise<void>;
}

let nextConnectionId = 1;

export async function serve(options: ServeOptions = {}): Promise<RunningServer> {
  const port = options.port ?? 8787;
  const heartbeatMs = options.heartbeatMs ?? 30_000;
  const maxTables = options.maxTables ?? 500;
  const maxMessageBytes = options.maxMessageBytes ?? 16 * 1024;
  const messagesPerSecond = options.messagesPerSecond ?? 20;
  const now = options.now ?? Date.now;
  const registry = new TableRegistry(options);
  const openings = slidingWindow(options.tablesPerMinute ?? 10, 60_000, now);

  const allowOrigins = options.allowOrigins ?? [];

  const http: Server = createServer((request, response) => {
    cors(request, response, allowOrigins);
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    // For a host's health check: the process is up and answering. Never cached,
    // so a stale answer cannot hide a dead server.
    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ ok: true, tables: registry.size }));
      return;
    }

    // One non-socket route, so opening a table is a plain request rather than
    // requiring a socket just to find out where to point one.
    if (request.method === 'POST' && request.url === '/tables') {
      if (!originAllowed(request.headers.origin, request.headers.host, allowOrigins)) {
        return refuse(response, 403, 'Tables cannot be opened from that site.');
      }
      if (!openings.allow(clientAddress(request, options.trustProxy ?? false))) {
        response.setHeader('retry-after', '60');
        return refuse(response, 429, 'Too many tables opened. Try again in a minute.');
      }
      if (registry.size >= maxTables) {
        return refuse(response, 503, 'Every table is in use. Try again soon.');
      }
      const table = registry.create();
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: table.code }));
      return;
    }

    if (options.clientDir && request.method === 'GET') {
      if (serveClient(options.clientDir, request, response)) return;
    }

    response.writeHead(404).end();
  });

  const sockets = new WebSocketServer({
    server: http,
    // Oversized frames are refused by the socket library before a byte of
    // them is buffered for us, which is the only place that limit means
    // anything — checking length after parsing is checking after paying.
    maxPayload: maxMessageBytes,
    verifyClient: ({ origin, req }: { origin: string; req: IncomingMessage }) =>
      originAllowed(origin, req.headers.host, allowOrigins),
  });
  /** Sockets that have not answered the last ping. */
  const alive = new WeakSet<WebSocket>();

  sockets.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const code = tableCodeFrom(request.url);
    const table = code ? registry.get(code) : undefined;
    if (!table) {
      socket.send(encodeServer({ type: 'CLOSED', reason: 'No such table.' }));
      socket.close();
      return;
    }

    const connection: Connection = {
      id: `c${nextConnectionId++}`,
      send: (raw) => {
        if (socket.readyState === socket.OPEN) socket.send(raw);
      },
      close: () => socket.close(),
    };

    alive.add(socket);
    socket.on('pong', () => alive.add(socket));

    // A fixed one-second window. Nobody clicks twenty times a second; a
    // script does, and every one of its messages is a full snapshot fanned
    // out to three other people.
    let windowStart = now();
    let inWindow = 0;

    socket.on('message', (data) => {
      const at = now();
      if (at - windowStart >= 1_000) {
        windowStart = at;
        inWindow = 0;
      }
      if (++inWindow > messagesPerSecond) {
        socket.terminate();
        return;
      }

      const decoded = decodeClient(typeof data === 'string' ? data : data.toString('utf8'));
      if (!decoded.ok) {
        // A bad frame is answered, not ignored: a client waiting on a reply it
        // is never going to get looks exactly like a server that has hung.
        connection.send(encodeServer({ type: 'REJECTED', reason: decoded.reason }));
        return;
      }
      table.handle(connection, decoded.envelope);
    });

    socket.on('close', () => table.disconnect(connection));
    socket.on('error', () => table.disconnect(connection));
  });

  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
    registry.sweep();
    openings.prune();
  }, heartbeatMs);
  // Do not hold the process open for a timer whose only job is tidying.
  heartbeat.unref?.();

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const address = http.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;

  return {
    port: boundPort,
    registry,
    async close() {
      clearInterval(heartbeat);
      registry.closeAll('The server is shutting down.');
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

/** `/table/ABC123` or `/?table=ABC123`. Anything else is not a table. */
function tableCodeFrom(url: string | undefined): string | null {
  if (!url) return null;
  const parsed = new URL(url, 'http://localhost');
  const fromQuery = parsed.searchParams.get('table');
  if (fromQuery) return fromQuery.toUpperCase();
  const match = /^\/table\/([A-Za-z0-9]{1,16})$/.exec(parsed.pathname);
  return match ? match[1]!.toUpperCase() : null;
}

/**
 * Whether a request from this origin may open tables or sockets.
 *
 * No origin at all is not a browser — a test, a script, a health check — and
 * a browser-only rule has nothing to say about it; the rate limits still do.
 * A page served by this process is same-origin, so its host matches ours.
 */
function originAllowed(origin: string | undefined, host: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  if (allowed.includes('*') || allowed.includes(origin)) return true;
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}

function cors(request: IncomingMessage, response: ServerResponse, allowed: string[]): void {
  const origin = request.headers.origin;
  if (!origin) return;
  const permitted = allowed.includes('*') || allowed.includes(origin);
  if (!permitted) return;
  response.setHeader('access-control-allow-origin', allowed.includes('*') ? '*' : origin);
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  response.setHeader('access-control-max-age', '86400');
}

function refuse(response: ServerResponse, status: number, error: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error }));
}

function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

/** At most `limit` hits per key within any `windowMs`. */
function slidingWindow(limit: number, windowMs: number, now: () => number) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string): boolean {
      const at = now();
      const recent = (hits.get(key) ?? []).filter((t) => at - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(at);
      hits.set(key, recent);
      return true;
    },
    /** Forget addresses with nothing recent, so the map cannot grow forever. */
    prune(): void {
      const at = now();
      for (const [key, times] of hits) {
        if (times.every((t) => at - t >= windowMs)) hits.delete(key);
      }
    },
  };
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Serves a built client, falling back to `index.html`.
 *
 * The fallback is what makes a shared link work: `/?table=ABC123` is the
 * client with a query on it, but any path that is not a file has to reach the
 * app rather than a 404, because the app is the only thing that knows what a
 * path means.
 *
 * Paths are resolved and checked against the root before anything is opened.
 * A request is a string somebody else chose, and `../../etc/passwd` is a
 * string.
 */
function serveClient(root: string, request: IncomingMessage, response: ServerResponse): boolean {
  const base = resolve(root);
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const candidate = resolve(join(base, normalize(pathname)));
  const isFile = candidate.startsWith(base) && existsSync(candidate) && statSync(candidate).isFile();
  const file = isFile ? candidate : join(base, 'index.html');

  if (!existsSync(file)) return false;
  const type = CONTENT_TYPES[extname(file)] ?? 'application/octet-stream';
  // Vite names built assets by content hash, so a file under /assets/ never
  // changes under the same name and can be kept forever. The page itself is
  // always revalidated, or a deploy would leave people on the old build.
  const cacheable = isFile && pathname.startsWith('/assets/');
  const headers: Record<string, string> = {
    'content-type': type,
    'cache-control': cacheable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    vary: 'accept-encoding',
  };
  // Text compresses to about a third. A proxy in front may do this already;
  // doing it here too means a bare deployment is not three times slower.
  const compressible = /^(text\/|application\/json|image\/svg)/.test(type);
  const acceptsGzip = /\bgzip\b/.test(String(request.headers['accept-encoding'] ?? ''));
  if (compressible && acceptsGzip) {
    response.writeHead(200, { ...headers, 'content-encoding': 'gzip' });
    createReadStream(file).pipe(createGzip()).pipe(response);
  } else {
    response.writeHead(200, headers);
    createReadStream(file).pipe(response);
  }
  return true;
}
