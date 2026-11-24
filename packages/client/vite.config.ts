import { defineConfig } from "vite";

/**
 * Relative base so the same build works at a project path
 * (`/WallStreetVerse/`) and at a custom domain root.
 */
export default defineConfig({
  root: __dirname,
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});
