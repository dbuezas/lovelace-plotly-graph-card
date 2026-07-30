import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 800, height: 600 },
  },
});
