import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@gestor/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@gestor/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@gestor/utils': path.resolve(__dirname, '../../packages/utils/src/index.ts'),
      '@gestor/auth': path.resolve(__dirname, '../../packages/auth/src/index.ts'),
      '@gestor/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
      '@gestor/theme': path.resolve(__dirname, '../../packages/theme/src/index.ts'),
      '@gestor/storefront-preview': path.resolve(__dirname, '../../packages/storefront-preview/src/index.ts'),
      '@gestor/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      /**
       * PROXY DE DESENVOLVIMENTO LOCAL
       * ─────────────────────────────────────────────────────────────────────
       * Este proxy redireciona requisições /api/* para o backend local na
       * porta 3333 APENAS quando rodando via `pnpm dev` no navegador local.
       *
       * ⚠️  LIMITAÇÕES — leia antes de fazer o build do APK:
       *
       *  1. O proxy Vite NÃO funciona em builds de produção (vite build).
       *  2. O proxy Vite NÃO funciona em APKs Android via Capacitor —
       *     o WebView do dispositivo não passa pelo servidor de dev local.
       *  3. Para o APK funcionar, defina em .env.local (ou .env):
       *       VITE_API_URL=https://sua-api.onrender.com/api/v1
       *     Depois rebuilde e sincronize:
       *       pnpm --filter @gestor/web-tenant build
       *       cd apps/web-tenant && npx cap sync android
       *
       *  ✅ O proxy continua aqui para facilitar o desenvolvimento local
       *     quando VITE_API_URL não estiver definido (fallback para /api/v1).
       */
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
});
