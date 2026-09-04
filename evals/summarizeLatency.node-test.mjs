import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("applies a downloaded real-run trace to an eval report", async () => {
  const directory = await mkdtemp(join(tmpdir(), "workflow-real-run-"));
  try {
    const fixturePath = join(directory, "evals.json");
    const reportPath = join(directory, "report.json");
    const tracePath = join(directory, "real-run.json");
    const outputPath = join(directory, "latency.json");
    await writeFile(fixturePath, JSON.stringify([{
      name: "Read diagram",
      taskType: "read",
      messages: [{ role: "user", content: "Read the diagram." }],
    }]));
    await writeFile(reportPath, JSON.stringify({
      config: { evalsFile: fixturePath },
      results: { results: [{
        test: { name: "Read diagram", taskType: "read", expectedCall: null },
        response: { text: "Done" },
        outcome: "pass",
        runIndex: 1,
        timing: {
          durationMs: 10_000,
          timeToFirstToolCallMs: 2_000,
          toolExecutionMs: 100,
          nonToolDurationMs: 9_900,
          toolCallCount: 1,
          retryToolCallCount: 0,
          redundantToolCallCount: 0,
        },
      }] },
    }));
    await writeFile(tracePath, JSON.stringify({
      schemaVersion: "1.0",
      source: "chatgpt-in-app-browser",
      outcome: "success",
      caseName: "Read diagram",
      prompt: "Read the diagram.",
      timing: {
        durationMs: 120_000,
        timeToFirstToolCallMs: 30_000,
        toolExecutionMs: 250,
        nonToolDurationMs: 119_750,
        timeAfterLastToolCallMs: 20_000,
        toolCallCount: 1,
      },
    }));

    const result = spawnSync(process.execPath, [
      resolve("evals/summarizeLatency.mjs"),
      reportPath,
      "--real-trace", tracePath,
      "--out", outputPath,
    ], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /real 120\.00s · eval 10\.00s · 12\.00× \(110\.00s gap\)/);
    const summary = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(summary.realRunComparison.byCase["Read diagram"].p50Gap.durationMs, 110_000);
    assert.deepEqual(summary.realRunComparison.excludes, ["browser-startup", "page-navigation"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
