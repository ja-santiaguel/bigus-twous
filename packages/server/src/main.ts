import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from './ws.js';

/**
 * The entry point.
 *
 * Deliberately thin: everything interesting is testable without it, and a
 * process that does nothing but read configuration and start is a process that
 * cannot develop behaviour of its own.
 */
const port = Number(process.env['PORT'] ?? 8787);

/**
 * A built client to serve alongside the tables, if this process should serve
 * one. Resolved against the working directory and checked before starting,
 * because a wrong path here produced an empty page and no error at all — the
 * server ran perfectly and served nothing, which is the hardest kind of
 * misconfiguration to find.
 */
const flag = process.argv.indexOf('--client-dir');
// `--client-dir` as well as the variable, so `npm start` can pass it on every
// platform: setting an environment variable inline does not work on Windows.
const configured = process.env['CLIENT_DIR'] ?? (flag !== -1 ? process.argv[flag + 1] : undefined);
const clientDir = configured ? resolve(process.cwd(), configured) : null;

if (clientDir && !existsSync(clientDir)) {
  console.error(`CLIENT_DIR is set to ${clientDir}, but there is nothing there.`);
  console.error('Build the client first, or unset CLIENT_DIR to run tables only.');
  process.exit(1);
}

/**
 * Other sites allowed to open tables here, comma-separated.
 *
 * Serving the client from this process needs none: the page is same-origin.
 * Running tables only means the client is on Vite in development, so that is
 * the default then — and a deployment that splits client and tables across
 * origins says so explicitly rather than inheriting "anyone".
 */
const allowOrigins = (process.env['ALLOW_ORIGINS'] ?? (clientDir ? '' : 'http://localhost:5173,http://127.0.0.1:5173'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/** Set to 1 only behind a proxy that sets X-Forwarded-For. */
const trustProxy = process.env['TRUST_PROXY'] === '1';

const server = await serve({ port, allowOrigins, trustProxy, ...(clientDir ? { clientDir } : {}) });

console.log(`Big Two tables listening on :${server.port}`);
console.log(clientDir ? `Serving the client from ${clientDir}` : 'Tables only — the client is served elsewhere.');
if (allowOrigins.length > 0) console.log(`Allowing tables from: ${allowOrigins.join(', ')}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
