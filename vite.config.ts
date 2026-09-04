import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import { sites } from "@openai/sites-vite-plugin";
import react from "@vitejs/plugin-react";

function publishEvalReport(): Plugin {
  const reports = [
    [".evals/report-1788489646719.html", "gpt-5.6-terra-current.html"],
    [".evals/report-1788489646719-latency.json", "gpt-5.6-terra-current-latency.json"],
    [".evals/report-1788485842899.html", "gpt-5.6-terra-pre-trim.html"],
    [".evals/report-1788485842899-latency.json", "gpt-5.6-terra-pre-trim-latency.json"],
  ] as const;

  return {
    name: "publish-eval-report",
    closeBundle() {
      const destination = resolve("dist/evals/reports");
      mkdirSync(destination, { recursive: true });
      for (const [source, filename] of reports) {
        copyFileSync(resolve(source), resolve(destination, filename));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), sites(), publishEvalReport()],
  test: {
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    css: true,
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});
