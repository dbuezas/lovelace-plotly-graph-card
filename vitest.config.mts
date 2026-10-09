import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // yaml-editor is a separate package whose tests run with `node --test`
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
