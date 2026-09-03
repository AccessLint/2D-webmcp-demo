const METRICS = {
  durationMs: { successfulOnly: true },
  timeToFirstToolCallMs: { successfulOnly: true },
  toolExecutionMs: { successfulOnly: true },
  nonToolDurationMs: { successfulOnly: true },
  modelExecutionMs: { successfulOnly: true },
  modelStepCount: { successfulOnly: true },
  inputTokenCount: { successfulOnly: true },
  outputTokenCount: { successfulOnly: true },
  toolSchemaCharacterCount: { successfulOnly: true },
  toolCallCount: { successfulOnly: false },
  retryToolCallCount: { successfulOnly: false },
  redundantToolCallCount: { successfulOnly: false },
};

const TASK_TYPES = new Set(["create", "edit", "read", "interaction", "uncategorized"]);
const COMPLEX_CREATE_CASE = "Create a complex multi-branch bug workflow";

function round(value) {
  return Math.round(value * 100) / 100;
}

function assertTaskType(taskType) {
  if (!TASK_TYPES.has(taskType)) {
    throw new Error(`Unknown eval taskType ${JSON.stringify(taskType)}.`);
  }
  return taskType;
}

function assertOutcomeType(outcomeType) {
  if (outcomeType !== undefined && !isSupportedOutcomeType(outcomeType)) {
    throw new Error(`Unknown eval outcomeType ${JSON.stringify(outcomeType)}.`);
  }
  return outcomeType;
}

export function distribution(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
  return {
    count: sorted.length,
    min: round(sorted[0]),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: round(percentile(0.5)),
    p95: round(percentile(0.95)),
    max: round(sorted.at(-1)),
  };
}

export function evaluateLatencyGates(report) {
  const failures = [];
  const requireAtLeast = (label, actual, minimum) => {
    if (!Number.isFinite(actual) || actual < minimum) {
      failures.push(`${label}: expected at least ${minimum}, received ${String(actual)}.`);
    }
  };
  const requireAtMost = (label, actual, maximum) => {
    if (!Number.isFinite(actual) || actual > maximum) {
      failures.push(`${label}: expected at most ${maximum}, received ${String(actual)}.`);
    }
  };

  requireAtLeast("Semantic success rate", report?.all?.successRate, 1);
  requireAtLeast("Trajectory success rate", report?.all?.trajectorySuccessRate, 1);
  requireAtMost("Retry calls per attempt", report?.all?.metrics?.retryToolCallCount?.mean, 0);
  requireAtMost("Overall p50 latency (ms)", report?.all?.metrics?.durationMs?.p50, 10_000);
  requireAtMost("Overall p95 latency (ms)", report?.all?.metrics?.durationMs?.p95, 20_000);
  requireAtMost(
    "Complex-create p50 latency (ms)",
    report?.byCase?.[COMPLEX_CREATE_CASE]?.metrics?.durationMs?.p50,
    15_000,
  );
  return failures;
}

function hasRequiredExpectedCall(nodes) {
  return (nodes || []).some((node) => {
    if (node && typeof node === "object" && "functionName" in node) return !node.optional;
    return hasRequiredExpectedCall(node?.ordered || node?.unordered || []);
  });
}

function groupAttempts(stepResults, fixtureMetadataByName) {
  const attempts = new Map();
  for (const result of stepResults) {
    const name = result.test?.name || result.test?.messages?.[0]?.content || "Unnamed eval";
    const runIndex = result.runIndex || 1;
    const key = `${name}\u0000${runIndex}`;
    const fixtureMetadata = fixtureMetadataByName.get(name);
    const taskType = assertTaskType(result.test?.taskType || fixtureMetadata?.taskType || "uncategorized");
    const attempt = attempts.get(key) || {
      name,
      runIndex,
      taskType,
      outcomeType: assertOutcomeType(result.test?.outcomeType || fixtureMetadata?.outcomeType),
      results: [],
    };
    attempt.results.push(result);
    attempts.set(key, attempt);
  }
  return [...attempts.values()].map((attempt) => {
    const required = attempt.results.filter((result) =>
      hasRequiredExpectedCall(result.test?.expectedCall),
    );
    const hasError = attempt.results.some((result) => result.outcome === "error");
    const trajectorySuccessful = !hasError && (required.length > 0
      ? required.every((result) => result.outcome === "pass")
      : attempt.results.every((result) => result.outcome === "pass"));
    const successful = attempt.taskType === "create" || attempt.taskType === "edit"
      ? hasVerifiedTaskOutcome(attempt, true)
      : trajectorySuccessful;
    return {
      ...attempt,
      successful,
      trajectorySuccessful,
      timing: attempt.results.find((result) => result.timing)?.timing || null,
    };
  });
}

function summarizeAttempts(attempts) {
  const successful = attempts.filter((attempt) => attempt.successful && attempt.timing);
  const summary = {
    attempts: attempts.length,
    successfulAttempts: attempts.filter((attempt) => attempt.successful).length,
    timedSuccessfulAttempts: successful.length,
    successRate: attempts.length === 0
      ? 0
      : round(attempts.filter((attempt) => attempt.successful).length / attempts.length),
    trajectorySuccessfulAttempts: attempts.filter((attempt) => attempt.trajectorySuccessful).length,
    trajectorySuccessRate: attempts.length === 0
      ? 0
      : round(attempts.filter((attempt) => attempt.trajectorySuccessful).length / attempts.length),
    metrics: {},
  };
  for (const [key, metric] of Object.entries(METRICS)) {
    const source = metric.successfulOnly ? successful : attempts.filter((attempt) => attempt.timing);
    summary.metrics[key] = distribution(
      source.map((attempt) => attempt.timing?.[key]).filter(Number.isFinite),
    );
  }
  summary.metrics.allAttemptDurationMs = distribution(
    attempts.map((attempt) => attempt.timing?.durationMs).filter(Number.isFinite),
  );
  return summary;
}

export function buildLatencyReport(report, fixtureCases = []) {
  const stepResults = report?.results?.results;
  if (!Array.isArray(stepResults)) {
    throw new Error("Expected a webmcp-evals JSON report with results.results.");
  }
  const fixtureMetadataByName = new Map(
    fixtureCases
      .filter((test) => test.name && test.taskType)
      .map((test) => [test.name, {
        taskType: assertTaskType(test.taskType),
        outcomeType: assertOutcomeType(test.outcomeType),
      }]),
  );
  const attempts = groupAttempts(stepResults, fixtureMetadataByName);
  const taskTypes = [...new Set(attempts.map((attempt) => attempt.taskType))].sort();
  const caseNames = [...new Set(attempts.map((attempt) => attempt.name))].sort();
  return {
    generatedAt: new Date().toISOString(),
    source: {
      model: report.config?.model,
      backend: report.config?.backend,
      runs: report.config?.runs,
      evalsFile: report.config?.evalsFile,
    },
    units: { duration: "milliseconds", successRate: "fraction" },
    all: summarizeAttempts(attempts),
    byTaskType: Object.fromEntries(
      taskTypes.map((taskType) => [
        taskType,
        summarizeAttempts(attempts.filter((attempt) => attempt.taskType === taskType)),
      ]),
    ),
    byCase: Object.fromEntries(
      caseNames.map((name) => [
        name,
        summarizeAttempts(attempts.filter((attempt) => attempt.name === name)),
      ]),
    ),
  };
}
import { hasVerifiedTaskOutcome, isSupportedOutcomeType } from "./taskOutcome.mjs";
