import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@gestor/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['recharts', 'lucide-react', 'react-router-dom', '@gestor/types'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
