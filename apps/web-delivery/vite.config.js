import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    plugins: [
        react(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@gestor/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
            '@gestor/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
            '@gestor/utils': path.resolve(__dirname, '../../packages/utils/src/index.ts'),
            '@gestor/auth': path.resolve(__dirname, '../../packages/auth/src/index.ts'),
            '@gestor/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
            '@gestor/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
        },
    },
    server: {
        port: 5174,
    },
});
