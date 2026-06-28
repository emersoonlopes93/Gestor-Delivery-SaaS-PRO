import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@gestor/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
      '@gestor/utils': fileURLToPath(new URL('../../packages/utils/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
