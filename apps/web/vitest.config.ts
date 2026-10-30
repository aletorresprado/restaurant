import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@repo/config': fileURLToPath(new URL('../../packages/config/src/index.ts', import.meta.url)),
      '@repo/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url),
      ),
    },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
