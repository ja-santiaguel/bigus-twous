import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// The workspace packages ship TypeScript source rather than a build, so they
// are aliased straight to their entry points. This keeps the app, engine and
// AI in one type-checked graph with no build step between them during dev.
export default defineConfig({
  // Where the site is served from: `/` locally and on a domain of its own. A
  // GitHub project site lives under `/<repository>/`, which the deploy workflow sets.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  // A browser-hosted table runs in a module worker that imports the shared packages.
  worker: { format: 'es' },
  resolve: {
    alias: {
      '@big-two/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@big-two/ai': fileURLToPath(new URL('../ai/src/index.ts', import.meta.url)),
    },
  },
});
