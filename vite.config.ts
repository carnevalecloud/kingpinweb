import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const page = (name: string) => resolve(import.meta.dirname, "src/web", name);

export default defineConfig({
  root: "src/web",
  // Relative URLs so dist/ can be served from any path on any static host.
  base: "./",
  publicDir: resolve(import.meta.dirname, "public"),
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rolldownOptions: {
      input: { main: page("index.html"), inspector: page("inspector.html"), play: page("play.html"), models: page("models.html") },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [".ddev.site"],
  },
  test: {
    root: import.meta.dirname,
    include: ["tests/unit/**/*.test.ts"],
  },
});
