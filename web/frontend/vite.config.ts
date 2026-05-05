import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite proxies API + snapshot routes to the FastAPI backend during dev so the
// browser sees a single origin (cookies just work).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/snapshot.json": "http://127.0.0.1:8080",
      "/device": "http://127.0.0.1:8080",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
