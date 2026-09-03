import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { buildLatencyReport } from "./latencyReport.mjs";

async function latestJsonReport() {
  const outputDirectory = resolve(".evals");
  const entries = await readdir(outputDirectory);
  const reports = entries
    .filter((entry) => /^report-\d+\.json$/.test(entry))
    .sort((a, b) => Number(b.match(/\d+/)?.[0]) - Number(a.match(/\d+/)?.[0]));
  if (!reports[0]) throw new Error("No .evals/report-<timestamp>.json file was found.");
  return resolve(outputDirectory, reports[0]);
}

const reportArgument = process.argv[2] && !process.argv[2].startsWith("--")
  ? resolve(process.argv[2])
  : await latestJsonReport();
const outputFlag = process.argv.indexOf("--out");
const outputPath = outputFlag >= 0
  ? resolve(process.argv[outputFlag + 1])
  : resolve(".evals", `${basename(reportArgument, extname(reportArgument))}-latency.json`);

const report = JSON.parse(await readFile(reportArgument, "utf8"));
const fixturePath = report.config?.evalsFile ? resolve(report.config.evalsFile) : resolve("evals/webmcp-evals.json");
let fixtureCases = [];
try {
  fixtureCases = JSON.parse(await readFile(fixturePath, "utf8"));
} catch {
  console.warn(`Could not read eval metadata from ${fixturePath}; uncategorized results will remain grouped together.`);
}

const summary = buildLatencyReport(report, fixtureCases);
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);

const formatDuration = (metric) => metric ? `p50 ${(metric.p50 / 1000).toFixed(2)}s · p95 ${(metric.p95 / 1000).toFixed(2)}s` : "not measured";
console.log("\nAgent turnaround (successful task trajectories)");
console.log(`All: ${summary.all.successfulAttempts}/${summary.all.attempts} successful · ${formatDuration(summary.all.metrics.durationMs)}`);
for (const [taskType, result] of Object.entries(summary.byTaskType)) {
  console.log(`${taskType}: ${result.successfulAttempts}/${result.attempts} successful · ${formatDuration(result.metrics.durationMs)}`);
}
console.log(`\nLatency report saved to ${outputPath}`);
