import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@big-two/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@big-two/ai': fileURLToPath(new URL('../ai/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
