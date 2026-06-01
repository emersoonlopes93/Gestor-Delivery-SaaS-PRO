import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@gestor/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@gestor/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@gestor/utils': path.resolve(__dirname, '../../packages/utils/src/index.ts'),
      '@gestor/auth': path.resolve(__dirname, '../../packages/auth/src/index.ts'),
      '@gestor/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
      '@gestor/theme': path.resolve(__dirname, '../../packages/theme/src/index.ts'),
      '@gestor/storefront-ui': path.resolve(__dirname, '../../packages/storefront-ui/src/index.ts'),
      '@gestor/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
})
