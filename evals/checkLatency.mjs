import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateLatencyGates } from "./latencyReport.mjs";

async function latestLatencyReport() {
  const outputDirectory = resolve(".evals");
  const entries = await readdir(outputDirectory);
  const reports = entries
    .filter((entry) => /^report-\d+-latency\.json$/.test(entry))
    .sort((a, b) => Number(b.match(/\d+/)?.[0]) - Number(a.match(/\d+/)?.[0]));
  if (!reports[0]) throw new Error("No .evals/report-<timestamp>-latency.json file was found.");
  return resolve(outputDirectory, reports[0]);
}

const reportPath = process.argv[2] ? resolve(process.argv[2]) : await latestLatencyReport();
const report = JSON.parse(await readFile(reportPath, "utf8"));
const failures = evaluateLatencyGates(report);

if (failures.length > 0) {
  console.error(`Latency gates failed for ${reportPath}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Latency gates passed for ${reportPath}.`);
}
