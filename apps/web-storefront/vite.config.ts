import { defineConfig, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'http'

function dynamicManifestPlugin() {
  return {
    name: 'dynamic-manifest',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url?.startsWith('/manifest/') && req.url.endsWith('.webmanifest')) {
          const slug = req.url.replace('/manifest/', '').replace('.webmanifest', '');
          const manifest = {
            id: `/${slug}`,
            name: `PedeHub (${slug})`,
            short_name: "Delivery",
            description: "Cardapio, pedidos, carteira, fidelidade e tracking em tempo real.",
            start_url: `/${slug}`,
            scope: `/${slug}`,
            display: "standalone",
            display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
            orientation: "portrait",
            background_color: "#ffffff",
            theme_color: "#111827",
            icons: [
              { src: "/icons/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
              { src: "/icons/app-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
            ]
          };
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(JSON.stringify(manifest));
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), dynamicManifestPlugin()],
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
  build: {
    chunkSizeWarningLimit: 1000,
  },
})
