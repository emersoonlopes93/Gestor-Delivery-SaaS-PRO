// vite.config.js
import { defineConfig } from "file:///C:/Users/Emerson/Documents/GitHub/Gestor-Delivery-SaaS-PRO/node_modules/.pnpm/vite@5.4.21_@types+node@22.19.17_terser@5.46.2/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Emerson/Documents/GitHub/Gestor-Delivery-SaaS-PRO/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@22.19.17_terser@5.46.2_/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { fileURLToPath } from "url";
var __vite_injected_original_import_meta_url = "file:///C:/Users/Emerson/Documents/GitHub/Gestor-Delivery-SaaS-PRO/apps/web-delivery/vite.config.js";
var __filename = fileURLToPath(__vite_injected_original_import_meta_url);
var __dirname = path.dirname(__filename);
var vite_config_default = defineConfig({
  plugins: [
    react()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@gestor/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@gestor/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@gestor/utils": path.resolve(__dirname, "../../packages/utils/src/index.ts"),
      "@gestor/auth": path.resolve(__dirname, "../../packages/auth/src/index.ts"),
      "@gestor/config": path.resolve(__dirname, "../../packages/config/src/index.ts"),
      "@gestor/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts")
    }
  },
  server: {
    port: 5174
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxFbWVyc29uXFxcXERvY3VtZW50c1xcXFxHaXRIdWJcXFxcR2VzdG9yLURlbGl2ZXJ5LVNhYVMtUFJPXFxcXGFwcHNcXFxcd2ViLWRlbGl2ZXJ5XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxFbWVyc29uXFxcXERvY3VtZW50c1xcXFxHaXRIdWJcXFxcR2VzdG9yLURlbGl2ZXJ5LVNhYVMtUFJPXFxcXGFwcHNcXFxcd2ViLWRlbGl2ZXJ5XFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9FbWVyc29uL0RvY3VtZW50cy9HaXRIdWIvR2VzdG9yLURlbGl2ZXJ5LVNhYVMtUFJPL2FwcHMvd2ViLWRlbGl2ZXJ5L3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJztcclxuXHJcbmNvbnN0IF9fZmlsZW5hbWUgPSBmaWxlVVJMVG9QYXRoKGltcG9ydC5tZXRhLnVybCk7XHJcbmNvbnN0IF9fZGlybmFtZSA9IHBhdGguZGlybmFtZShfX2ZpbGVuYW1lKTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgICBwbHVnaW5zOiBbXHJcbiAgICAgICAgcmVhY3QoKSxcclxuICAgIF0sXHJcbiAgICByZXNvbHZlOiB7XHJcbiAgICAgICAgYWxpYXM6IHtcclxuICAgICAgICAgICAgJ0AnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9zcmMnKSxcclxuICAgICAgICAgICAgJ0BnZXN0b3IvdHlwZXMnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vcGFja2FnZXMvdHlwZXMvc3JjL2luZGV4LnRzJyksXHJcbiAgICAgICAgICAgICdAZ2VzdG9yL2NvcmUnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vcGFja2FnZXMvY29yZS9zcmMvaW5kZXgudHMnKSxcclxuICAgICAgICAgICAgJ0BnZXN0b3IvdXRpbHMnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vcGFja2FnZXMvdXRpbHMvc3JjL2luZGV4LnRzJyksXHJcbiAgICAgICAgICAgICdAZ2VzdG9yL2F1dGgnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vcGFja2FnZXMvYXV0aC9zcmMvaW5kZXgudHMnKSxcclxuICAgICAgICAgICAgJ0BnZXN0b3IvY29uZmlnJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3BhY2thZ2VzL2NvbmZpZy9zcmMvaW5kZXgudHMnKSxcclxuICAgICAgICAgICAgJ0BnZXN0b3IvdWknOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vcGFja2FnZXMvdWkvc3JjL2luZGV4LnRzJyksXHJcbiAgICAgICAgfSxcclxuICAgIH0sXHJcbiAgICBzZXJ2ZXI6IHtcclxuICAgICAgICBwb3J0OiA1MTc0LFxyXG4gICAgfSxcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBc2EsU0FBUyxvQkFBb0I7QUFDbmMsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHFCQUFxQjtBQUhpUCxJQUFNLDJDQUEyQztBQUtoVSxJQUFNLGFBQWEsY0FBYyx3Q0FBZTtBQUNoRCxJQUFNLFlBQVksS0FBSyxRQUFRLFVBQVU7QUFFekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDeEIsU0FBUztBQUFBLElBQ0wsTUFBTTtBQUFBLEVBQ1Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNMLE9BQU87QUFBQSxNQUNILEtBQUssS0FBSyxRQUFRLFdBQVcsT0FBTztBQUFBLE1BQ3BDLGlCQUFpQixLQUFLLFFBQVEsV0FBVyxtQ0FBbUM7QUFBQSxNQUM1RSxnQkFBZ0IsS0FBSyxRQUFRLFdBQVcsa0NBQWtDO0FBQUEsTUFDMUUsaUJBQWlCLEtBQUssUUFBUSxXQUFXLG1DQUFtQztBQUFBLE1BQzVFLGdCQUFnQixLQUFLLFFBQVEsV0FBVyxrQ0FBa0M7QUFBQSxNQUMxRSxrQkFBa0IsS0FBSyxRQUFRLFdBQVcsb0NBQW9DO0FBQUEsTUFDOUUsY0FBYyxLQUFLLFFBQVEsV0FBVyxnQ0FBZ0M7QUFBQSxJQUMxRTtBQUFBLEVBQ0o7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNKLE1BQU07QUFBQSxFQUNWO0FBQ0osQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
