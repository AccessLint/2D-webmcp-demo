import baselineLatencyReport from "../../.evals/report-1788485842899-latency.json";
import latestLatencyReport from "../../.evals/report-1788489646719-latency.json";

export type EvalRun = {
  id: string;
  label: string;
  recordedAt: string;
  model: string;
  backend: string;
  browser: string;
  runsPerCase: number;
  cases: number;
  fixture: string;
  reportPath: string;
  deterministicSmoke: { passed: number; total: number };
  note: string;
};

export const latestEvalRun = {
  id: "2026-09-03-gpt-5-6-terra-current-1788489646719",
  label: "Current fixture",
  recordedAt: "2026-09-03T22:40:46-04:00",
  model: latestLatencyReport.source.model,
  backend: "Vercel",
  browser: "Chrome Stable",
  runsPerCase: latestLatencyReport.source.runs,
  cases: latestLatencyReport.all.attempts / latestLatencyReport.source.runs,
  fixture: latestLatencyReport.source.evalsFile,
  reportPath: "/evals/reports/gpt-5.6-terra-current.html",
  latencyPath: "/evals/reports/gpt-5.6-terra-current-latency.json",
  deterministicSmoke: { passed: 12, total: 12 },
  outcomes: {
    all: {
      passed: latestLatencyReport.all.successfulAttempts,
      total: latestLatencyReport.all.attempts,
    },
    create: {
      passed: latestLatencyReport.byTaskType.create.successfulAttempts,
      total: latestLatencyReport.byTaskType.create.attempts,
    },
    edit: {
      passed: latestLatencyReport.byTaskType.edit.successfulAttempts,
      total: latestLatencyReport.byTaskType.edit.attempts,
    },
    efficient: {
      passed: latestLatencyReport.all.trajectorySuccessfulAttempts,
      total: latestLatencyReport.all.attempts,
    },
  },
  latency: latestLatencyReport.all.metrics,
  note:
    "All 50 journeys reached the requested workflow outcome through the expected efficient trajectory, with no retries or redundant calls. The smaller five-tool interface cut mean input tokens by 39.1% and mean schema exposure by 36.5% from the pre-trim baseline.",
};

export const baselineEvalRun = {
  id: "2026-09-03-gpt-5-6-terra-pre-trim-1788485842899",
  label: "Pre-trim baseline",
  recordedAt: "2026-09-03T21:37:22-04:00",
  model: baselineLatencyReport.source.model,
  backend: "Vercel",
  browser: "Chrome Stable",
  runsPerCase: baselineLatencyReport.source.runs,
  cases: baselineLatencyReport.all.attempts / baselineLatencyReport.source.runs,
  fixture: baselineLatencyReport.source.evalsFile,
  reportPath: "/evals/reports/gpt-5.6-terra-pre-trim.html",
  latencyPath: "/evals/reports/gpt-5.6-terra-pre-trim-latency.json",
  outcomes: {
    all: {
      passed: baselineLatencyReport.all.successfulAttempts,
      total: baselineLatencyReport.all.attempts,
    },
    efficient: {
      passed: baselineLatencyReport.all.trajectorySuccessfulAttempts,
      total: baselineLatencyReport.all.attempts,
    },
  },
  latency: baselineLatencyReport.all.metrics,
};

export const evalRuns: EvalRun[] = [
  {
    id: "2026-08-31-gpt-5-mini-baseline",
    label: "Baseline",
    recordedAt: "2026-08-31T17:34:18-04:00",
    model: "openai:gpt-5-mini",
    backend: "Vercel",
    browser: "Chrome Stable",
    runsPerCase: 10,
    cases: 5,
    fixture: "evals/webmcp-evals.json",
    reportPath: "/evals/reports/gpt-5-mini-baseline.html",
    deterministicSmoke: { passed: 9, total: 9 },
    note:
      "The four direct tasks completed consistently. The complex edit failed because the agent sent commands in formats the tool did not accept.",
  },
  {
    id: "2026-08-31-gpt-5-mini-iteration-1",
    label: "Iteration 1",
    recordedAt: "2026-08-31T18:30:49-04:00",
    model: "openai:gpt-5-mini",
    backend: "Vercel",
    browser: "Chrome Stable",
    runsPerCase: 10,
    cases: 5,
    fixture: "evals/webmcp-evals.json",
    reportPath: "/evals/reports/gpt-5-mini-iteration-1.html",
    deterministicSmoke: { passed: 9, total: 9 },
    note:
      "The complex edit succeeded in all 10 attempts. Six attempts also surfaced the edit evidence, which is the remaining reliability gap.",
  },
  {
    id: "2026-08-31-gpt-5-mini-iteration-2",
    label: "Iteration 2",
    recordedAt: "2026-08-31T19:08:07-04:00",
    model: "openai:gpt-5-mini",
    backend: "Vercel",
    browser: "Chrome Stable",
    runsPerCase: 10,
    cases: 5,
    fixture: "evals/webmcp-evals.json",
    reportPath: "/evals/reports/gpt-5-mini-iteration-2.html",
    deterministicSmoke: { passed: 9, total: 9 },
    note:
      "100% of complex edits surfaced visible evidence. Extra discovery and inspection calls lowered exact-call efficiency, and 30% of reveal requests stopped at inspection instead of changing the visible selection.",
  },
];
