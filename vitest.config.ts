import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit and integration tests, run on the host with Node's own crypto. Nothing
 * here needs a browser, a database or a running container: what is tested here
 * is the logic that decides, and the wire behaviour is Playwright's job.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    reporters: ['verbose'],
  },
});
