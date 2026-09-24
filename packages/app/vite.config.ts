import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The version shown in the corner: the app's own, from package.json — bump it
// with each release — and the commit it was built from, for telling builds
// apart. Vercel names the commit; locally it is asked of git; neither, none.
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string })
  .version;
const commit = (() => {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
})();

// The site's public address, for link previews, which ignore relative URLs.
// Set VITE_SITE_URL to override; on Vercel it comes from the production domain.
// Empty locally, which leaves the preview image a relative path.
const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
process.env.VITE_SITE_URL ??= vercelDomain ? `https://${vercelDomain}` : '';

// The workspace packages ship TypeScript source rather than a build, so they
// are aliased straight to their entry points. This keeps the app, engine and
// AI in one type-checked graph with no build step between them during dev.
export default defineConfig({
  // Where the site is served from: `/` on a domain of its own, which is what
  // Vercel gives it. A subfolder host would set VITE_BASE to `/<folder>/`.
  base: process.env.VITE_BASE ?? '/',
  build: {
    // Small files are normally inlined into the CSS as base64. For fonts that
    // bloats the stylesheet every page downloads with glyphs most never use —
    // the browser fetches a font file only for characters it actually shows.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  // A browser-hosted table runs in a module worker that imports the shared packages.
  worker: { format: 'es' },
  resolve: {
    alias: {
      '@big-two/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@big-two/ai': fileURLToPath(new URL('../ai/src/index.ts', import.meta.url)),
    },
  },
});
