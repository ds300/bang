import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/client"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
  root: ".",
  server: {
    port: 5834,
    proxy: {
      "/api": "http://localhost:8432",
      "/ws": {
        target: "ws://localhost:8432",
        ws: true,
      },
    },
    watch: {
      ignored: ["**/data/**", "**/.wrangler/**"],
    },
  },
});
