import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

const outputDirectory = await mkdtemp(join(tmpdir(), "web-mcp-proof-surface-eval-"));
await build({
  configFile: false,
  logLevel: "silent",
  ssr: { noExternal: true },
  build: {
    ssr: resolve("evals/surfaceBridge.ts"),
    outDir: outputDirectory,
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: "surfaceBridge.mjs" } },
  },
});

const bridge = await import(pathToFileURL(join(outputDirectory, "surfaceBridge.mjs")));
await bridge.runSurfaceBridge();
