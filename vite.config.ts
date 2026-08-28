import { defineConfig } from "vitest/config";
import { sites } from "@openai/sites-vite-plugin";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), sites()],
  test: {
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    css: true,
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});
