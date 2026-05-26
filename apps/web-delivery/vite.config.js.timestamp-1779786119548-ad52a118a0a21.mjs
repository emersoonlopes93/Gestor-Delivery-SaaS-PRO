// vite.config.js
import { defineConfig } from "file:///C:/Users/Emerson/Documents/GitHub/Gestor-Delivery-SaaS-PRO/node_modules/.pnpm/vite@5.4.21_@types+node@22.19.17_terser@5.46.2/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/Emerson/Documents/GitHub/Gestor-Delivery-SaaS-PRO/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@22.19.17_terser@5.46.2_/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "C:\\Users\\Emerson\\Documents\\GitHub\\Gestor-Delivery-SaaS-PRO\\apps\\web-delivery";
var vite_config_default = defineConfig({
  plugins: [
    react()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      "@gestor/types": path.resolve(__vite_injected_original_dirname, "../../packages/types/src/index.ts"),
      "@gestor/core": path.resolve(__vite_injected_original_dirname, "../../packages/core/src/index.ts"),
      "@gestor/utils": path.resolve(__vite_injected_original_dirname, "../../packages/utils/src/index.ts"),
      "@gestor/auth": path.resolve(__vite_injected_original_dirname, "../../packages/auth/src/index.ts"),
      "@gestor/config": path.resolve(__vite_injected_original_dirname, "../../packages/config/src/index.ts"),
      "@gestor/ui": path.resolve(__vite_injected_original_dirname, "../../packages/ui/src/index.ts")
    }
  },
  server: {
    port: 5174
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxFbWVyc29uXFxcXERvY3VtZW50c1xcXFxHaXRIdWJcXFxcR2VzdG9yLURlbGl2ZXJ5LVNhYVMtUFJPXFxcXGFwcHNcXFxcd2ViLWRlbGl2ZXJ5XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxFbWVyc29uXFxcXERvY3VtZW50c1xcXFxHaXRIdWJcXFxcR2VzdG9yLURlbGl2ZXJ5LVNhYVMtUFJPXFxcXGFwcHNcXFxcd2ViLWRlbGl2ZXJ5XFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9FbWVyc29uL0RvY3VtZW50cy9HaXRIdWIvR2VzdG9yLURlbGl2ZXJ5LVNhYVMtUFJPL2FwcHMvd2ViLWRlbGl2ZXJ5L3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gICAgcGx1Z2luczogW1xyXG4gICAgICAgIHJlYWN0KCksXHJcbiAgICBdLFxyXG4gICAgcmVzb2x2ZToge1xyXG4gICAgICAgIGFsaWFzOiB7XHJcbiAgICAgICAgICAgICdAJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJyksXHJcbiAgICAgICAgICAgICdAZ2VzdG9yL3R5cGVzJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3BhY2thZ2VzL3R5cGVzL3NyYy9pbmRleC50cycpLFxyXG4gICAgICAgICAgICAnQGdlc3Rvci9jb3JlJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3BhY2thZ2VzL2NvcmUvc3JjL2luZGV4LnRzJyksXHJcbiAgICAgICAgICAgICdAZ2VzdG9yL3V0aWxzJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3BhY2thZ2VzL3V0aWxzL3NyYy9pbmRleC50cycpLFxyXG4gICAgICAgICAgICAnQGdlc3Rvci9hdXRoJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3BhY2thZ2VzL2F1dGgvc3JjL2luZGV4LnRzJyksXHJcbiAgICAgICAgICAgICdAZ2VzdG9yL2NvbmZpZyc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi9wYWNrYWdlcy9jb25maWcvc3JjL2luZGV4LnRzJyksXHJcbiAgICAgICAgICAgICdAZ2VzdG9yL3VpJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3BhY2thZ2VzL3VpL3NyYy9pbmRleC50cycpLFxyXG4gICAgICAgIH0sXHJcbiAgICB9LFxyXG4gICAgc2VydmVyOiB7XHJcbiAgICAgICAgcG9ydDogNTE3NCxcclxuICAgIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXNhLFNBQVMsb0JBQW9CO0FBQ25jLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFGakIsSUFBTSxtQ0FBbUM7QUFHekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDeEIsU0FBUztBQUFBLElBQ0wsTUFBTTtBQUFBLEVBQ1Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNMLE9BQU87QUFBQSxNQUNILEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxNQUNwQyxpQkFBaUIsS0FBSyxRQUFRLGtDQUFXLG1DQUFtQztBQUFBLE1BQzVFLGdCQUFnQixLQUFLLFFBQVEsa0NBQVcsa0NBQWtDO0FBQUEsTUFDMUUsaUJBQWlCLEtBQUssUUFBUSxrQ0FBVyxtQ0FBbUM7QUFBQSxNQUM1RSxnQkFBZ0IsS0FBSyxRQUFRLGtDQUFXLGtDQUFrQztBQUFBLE1BQzFFLGtCQUFrQixLQUFLLFFBQVEsa0NBQVcsb0NBQW9DO0FBQUEsTUFDOUUsY0FBYyxLQUFLLFFBQVEsa0NBQVcsZ0NBQWdDO0FBQUEsSUFDMUU7QUFBQSxFQUNKO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDSixNQUFNO0FBQUEsRUFDVjtBQUNKLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
