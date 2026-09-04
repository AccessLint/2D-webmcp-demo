import latestLatencyReport from "../../.evals/report-1788467823279-latency.json";

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
  id: "2026-09-03-gpt-5-6-terra-current",
  label: "Current fixture",
  recordedAt: "2026-09-03T16:37:03-04:00",
  model: latestLatencyReport.source.model,
  backend: "Vercel",
  browser: "Chrome Stable",
  runsPerCase: latestLatencyReport.source.runs,
  cases: latestLatencyReport.all.attempts / latestLatencyReport.source.runs,
  fixture: latestLatencyReport.source.evalsFile,
  reportPath: "/evals/reports/gpt-5.6-terra-current.html",
  latencyPath: "/evals/reports/gpt-5.6-terra-current-latency.json",
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
    "All 50 journeys reached the requested workflow outcome. The agent also followed the expected efficient trajectory in 42 attempts, with rerouting accounting for most of the remaining extra calls.",
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
