import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const browserEvalCli = resolve(projectRoot, "node_modules/webmcp-evals/dist/bin/webmcp-evals.js");
const latencySummary = resolve(projectRoot, "evals/summarizeLatency.mjs");

const browserArguments = [
  browserEvalCli,
  "browser",
  "--chrome-channel", "chrome",
  "--url", "http://127.0.0.1:4173",
  "--evals", "evals/webmcp-evals.json",
  "--backend", "vercel",
  "--model", "openai:gpt-5.6-terra",
  "--runs", "10",
  "--max-steps", "8",
  "--reporter", "console", "json", "html",
];

function exitStatus(result) {
  return Number.isInteger(result?.status) ? result.status : 1;
}

export function runBrowserEvals(run = spawnSync) {
  const options = { cwd: projectRoot, stdio: "inherit" };
  const browserResult = run(process.execPath, browserArguments, options);
  const summaryResult = run(process.execPath, [latencySummary], options);
  const browserStatus = exitStatus(browserResult);
  return browserStatus === 0 ? exitStatus(summaryResult) : browserStatus;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runBrowserEvals();
}
