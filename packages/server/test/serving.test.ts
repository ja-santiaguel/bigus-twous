import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve, type RunningServer } from '../src/ws.js';

/**
 * Serving the client alongside the tables.
 *
 * One process for both is the simplest deployment there is, and it is what
 * lets the client resolve the table server as "wherever this page came from" —
 * so there is nothing to configure and nothing to configure wrongly.
 */

let server: RunningServer;
let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'bigtwo-client-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Big Two</title>');
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(tmpdir(), 'outside-the-root.txt'), 'secret');

  server = await serve({ port: 0, clientDir: root, heartbeatMs: 60_000, allowOrigins: ['http://localhost:5173'] });
});

afterAll(async () => {
  await server.close();
});

const get = (path: string) => fetch(`http://127.0.0.1:${server.port}${path}`);

describe('serving a built client', () => {
  it('serves the app at the root', async () => {
    const response = await get('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Big Two');
  });

  it('serves assets with a usable content type', async () => {
    const response = await get('/assets/app.js');
    expect(response.status).toBe(200);
    // A script served as octet-stream is a script the browser refuses to run.
    expect(response.headers.get('content-type')).toContain('javascript');
  });

  it('falls back to the app for a path that is not a file', async () => {
    // `/?table=ABC123` and any deep link have to reach the app, because the
    // app is the only thing that knows what a path means.
    const response = await get('/some/deep/link');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Big Two');
  });

  it('will not serve a file outside the client directory', async () => {
    // A request path is a string somebody else chose, and `../` is a string.
    for (const path of [
      '/../outside-the-root.txt',
      '/..%2Foutside-the-root.txt',
      '/assets/../../outside-the-root.txt',
    ]) {
      const response = await get(path);
      const body = await response.text();
      expect(body, path).not.toContain('secret');
    }
  });

  it('still opens tables', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/tables`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { code: string }).code).toMatch(/^[A-Z0-9]{6}$/);
  });
});

describe('serving for production', () => {
  it('answers a health check', async () => {
    const response = await get('/healthz');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it('caches hashed assets forever and the page never', async () => {
    const asset = await get('/assets/app.js');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    const page = await get('/');
    expect(page.headers.get('cache-control')).toBe('no-cache');
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('compresses text for a client that accepts it', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/assets/app.js`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(response.headers.get('content-encoding')).toBe('gzip');
    // fetch decompresses transparently, so the body is still the file.
    expect(await response.text()).toBe('console.log(1)');
  });
});

describe('cross-origin', () => {
  it('lets a client on another port open a table', async () => {
    // Development only: the client is on Vite's port and the tables on this
    // one. A deployment that serves both from one origin never needs this.
    const response = await fetch(`http://127.0.0.1:${server.port}/tables`, {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('does not open tables for a site it was not told about', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/tables`, {
      method: 'POST',
      headers: { origin: 'http://somewhere-else.example' },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers a preflight', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/tables`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('limits', () => {
  it('stops one address opening table after table', async () => {
    const limited = await serve({ port: 0, heartbeatMs: 60_000, tablesPerMinute: 2 });
    try {
      const open = () => fetch(`http://127.0.0.1:${limited.port}/tables`, { method: 'POST' });
      expect((await open()).status).toBe(200);
      expect((await open()).status).toBe(200);
      const third = await open();
      expect(third.status).toBe(429);
      expect(third.headers.get('retry-after')).toBe('60');
    } finally {
      await limited.close();
    }
  });

  it('stops opening tables once the server is full', async () => {
    const full = await serve({ port: 0, heartbeatMs: 60_000, maxTables: 1 });
    try {
      const open = () => fetch(`http://127.0.0.1:${full.port}/tables`, { method: 'POST' });
      expect((await open()).status).toBe(200);
      expect((await open()).status).toBe(503);
    } finally {
      await full.close();
    }
  });
});
