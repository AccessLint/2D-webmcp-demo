import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import { sites } from "@openai/sites-vite-plugin";
import react from "@vitejs/plugin-react";

function publishEvalReport(): Plugin {
  const reports = [
    [".evals/report-1788212058992.html", "gpt-5-mini-baseline.html"],
    [".evals/report-1788215449743.html", "gpt-5-mini-iteration-1.html"],
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
