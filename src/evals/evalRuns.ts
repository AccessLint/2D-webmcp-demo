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
  journeys: {
    discover: { passed: number; total: number };
    inspect: { passed: number; total: number };
    reveal: { passed: number; total: number };
    focus: { passed: number; total: number };
    retryJourney: { passed: number; total: number };
  };
  retryEdit: { passed: number; total: number };
  note: string;
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
    journeys: {
      discover: { passed: 10, total: 10 },
      inspect: { passed: 10, total: 10 },
      reveal: { passed: 10, total: 10 },
      focus: { passed: 10, total: 10 },
      retryJourney: { passed: 0, total: 10 },
    },
    retryEdit: { passed: 0, total: 10 },
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
    journeys: {
      discover: { passed: 10, total: 10 },
      inspect: { passed: 10, total: 10 },
      reveal: { passed: 10, total: 10 },
      focus: { passed: 10, total: 10 },
      retryJourney: { passed: 6, total: 10 },
    },
    retryEdit: { passed: 10, total: 10 },
    note:
      "The complex edit succeeded in all 10 attempts. Six attempts also surfaced the edit evidence, which is the remaining reliability gap.",
  },
];
