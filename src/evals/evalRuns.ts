import latestLatencyReport from "../../.evals/report-1788461611368-latency.json";

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
  strictSteps: { passed: number; total: number };
  scoreBreakdown: {
    taskCompletion: { passed: number; total: number };
    firstAttemptEditValidity: { passed: number; total: number };
    visibleEditEvidence: { passed: number; total: number };
  };
  journeys: {
    discover: { passed: number; total: number };
    inspect: { passed: number; total: number };
    reveal: { passed: number; total: number };
    focus: { passed: number; total: number };
    complexEditJourney: { passed: number; total: number };
  };
  complexEdit: { passed: number; total: number };
  note: string;
};

export const latestEvalRun = {
  id: "2026-09-03-gpt-5-6-terra-current",
  label: "Current fixture",
  recordedAt: "2026-09-03T14:53:31-04:00",
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
  },
  latency: latestLatencyReport.all.metrics,
  note:
    "Creation journeys completed in all 20 attempts. Edit journeys completed in 24 of 30 attempts, making edit reliability the next improvement target.",
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
    strictSteps: { passed: 61, total: 261 },
    scoreBreakdown: {
      taskCompletion: { passed: 40, total: 50 },
      firstAttemptEditValidity: { passed: 0, total: 10 },
      visibleEditEvidence: { passed: 0, total: 10 },
    },
    journeys: {
      discover: { passed: 10, total: 10 },
      inspect: { passed: 10, total: 10 },
      reveal: { passed: 10, total: 10 },
      focus: { passed: 10, total: 10 },
      complexEditJourney: { passed: 0, total: 10 },
    },
    complexEdit: { passed: 0, total: 10 },
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
    strictSteps: { passed: 61, total: 134 },
    scoreBreakdown: {
      taskCompletion: { passed: 50, total: 50 },
      firstAttemptEditValidity: { passed: 3, total: 10 },
      visibleEditEvidence: { passed: 6, total: 10 },
    },
    journeys: {
      discover: { passed: 10, total: 10 },
      inspect: { passed: 10, total: 10 },
      reveal: { passed: 10, total: 10 },
      focus: { passed: 10, total: 10 },
      complexEditJourney: { passed: 6, total: 10 },
    },
    complexEdit: { passed: 10, total: 10 },
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
    strictSteps: { passed: 69, total: 173 },
    scoreBreakdown: {
      taskCompletion: { passed: 47, total: 50 },
      firstAttemptEditValidity: { passed: 6, total: 10 },
      visibleEditEvidence: { passed: 10, total: 10 },
    },
    journeys: {
      discover: { passed: 10, total: 10 },
      inspect: { passed: 10, total: 10 },
      reveal: { passed: 7, total: 10 },
      focus: { passed: 10, total: 10 },
      complexEditJourney: { passed: 10, total: 10 },
    },
    complexEdit: { passed: 10, total: 10 },
    note:
      "100% of complex edits surfaced visible evidence. Extra discovery and inspection calls lowered exact-call efficiency, and 30% of reveal requests stopped at inspection instead of changing the visible selection.",
  },
];
