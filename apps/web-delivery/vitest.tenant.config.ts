import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const tenantRoot = path.resolve(__dirname, '../web-tenant');

export default defineConfig({
  root: tenantRoot,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(tenantRoot, 'src'),
      '@gestor/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@gestor/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@gestor/utils': path.resolve(__dirname, '../../packages/utils/src/index.ts'),
      '@gestor/auth': path.resolve(__dirname, '../../packages/auth/src/index.ts'),
      '@gestor/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
      '@gestor/theme': path.resolve(__dirname, '../../packages/theme/src/index.ts'),
      '@gestor/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@testing-library/react': path.resolve(__dirname, 'node_modules/@testing-library/react'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/features/delivery/components/DriverSettlementsPanel.interaction.jsx'],
  },
});
