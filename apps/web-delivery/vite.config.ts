import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // VitePWA will be re-enabled when the app is fully implemented
    // with proper icons, manifest and service worker
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@gestor/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
  server: {
    port: 5174,
  },
});
