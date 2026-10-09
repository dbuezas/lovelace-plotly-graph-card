import { defineConfig } from "vite";

export default defineConfig({
  // Relative URLs, so the build works under the GitHub Pages subpath.
  base: "./",
  build: {
    sourcemap: true,
  },
  optimizeDeps: {
    // Vite's dependency scan skips workers. Without this, the dev server
    // discovers the YAML worker late and reloads the page on first start.
    include: ["monaco-yaml/yaml.worker.js"],
  },
  worker: {
    // The Monaco and YAML workers are ES modules.
    format: "es",
  },
});
