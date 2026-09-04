import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { buildLatencyReport, buildRealRunComparison } from "./latencyReport.mjs";

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
const realTracePaths = process.argv.flatMap((argument, index, arguments_) => (
  argument === "--real-trace" && arguments_[index + 1] ? [resolve(arguments_[index + 1])] : []
));

const report = JSON.parse(await readFile(reportArgument, "utf8"));
const fixturePath = report.config?.evalsFile ? resolve(report.config.evalsFile) : resolve("evals/webmcp-evals.json");
let fixtureCases = [];
try {
  fixtureCases = JSON.parse(await readFile(fixturePath, "utf8"));
} catch {
  console.warn(`Could not read eval metadata from ${fixturePath}; uncategorized results will remain grouped together.`);
}

const summary = buildLatencyReport(report, fixtureCases);
if (realTracePaths.length > 0) {
  const realRunTraces = [];
  for (const tracePath of realTracePaths) {
    const value = JSON.parse(await readFile(tracePath, "utf8"));
    realRunTraces.push(...(Array.isArray(value) ? value : [value]));
  }
  summary.realRunComparison = buildRealRunComparison(summary, realRunTraces, fixtureCases);
}
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);

const formatDuration = (metric) => metric ? `p50 ${(metric.p50 / 1000).toFixed(2)}s · p95 ${(metric.p95 / 1000).toFixed(2)}s` : "not measured";
console.log("\nAgent turnaround by verified task outcome");
console.log(`All: ${summary.all.successfulAttempts}/${summary.all.attempts} semantic · ${summary.all.trajectorySuccessfulAttempts}/${summary.all.attempts} efficient · ${formatDuration(summary.all.metrics.durationMs)}`);
for (const [taskType, result] of Object.entries(summary.byTaskType)) {
  console.log(`${taskType}: ${result.successfulAttempts}/${result.attempts} semantic · ${result.trajectorySuccessfulAttempts}/${result.attempts} efficient · ${formatDuration(result.metrics.durationMs)}`);
}
console.log("\nBy case");
for (const [name, result] of Object.entries(summary.byCase)) {
  console.log(`${name}: ${result.successfulAttempts}/${result.attempts} semantic · ${result.trajectorySuccessfulAttempts}/${result.attempts} efficient · ${formatDuration(result.metrics.durationMs)}`);
}
if (summary.realRunComparison) {
  console.log("\nReal ChatGPT run compared with eval p50");
  for (const [name, comparison] of Object.entries(summary.realRunComparison.byCase)) {
    const realDuration = comparison.real.metrics.durationMs.p50;
    const evalDuration = comparison.eval.metrics.durationMs.p50;
    const multiplier = comparison.p50Gap.durationMultiplier;
    console.log(`${name}: real ${(realDuration / 1000).toFixed(2)}s · eval ${(evalDuration / 1000).toFixed(2)}s · ${multiplier.toFixed(2)}× (${(comparison.p50Gap.durationMs / 1000).toFixed(2)}s gap)`);
    const beforeFirstTool = comparison.real.metrics.timeToFirstToolCallMs;
    const afterLastTool = comparison.real.metrics.timeAfterLastToolCallMs;
    if (beforeFirstTool) console.log(`  Before first tool: ${(beforeFirstTool.p50 / 1000).toFixed(2)}s`);
    if (afterLastTool) console.log(`  After last tool: ${(afterLastTool.p50 / 1000).toFixed(2)}s`);
    for (const warning of comparison.warnings) console.log(`  Warning: ${warning}`);
  }
}
console.log(`\nLatency report saved to ${outputPath}`);
