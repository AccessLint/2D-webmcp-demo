export type RealRunToolOutcome = "completed" | "failed" | "aborted";
export type RealRunOutcome = "success" | "failure" | "unverified";

export type RealRunToolSpan = {
  name: string;
  outcome: RealRunToolOutcome;
  startOffsetMs: number;
  durationMs: number;
};

export type RealRunTrace = {
  schemaVersion: "1.0";
  id: string;
  source: "chatgpt-in-app-browser";
  outcome: RealRunOutcome;
  measurementWindow: "manual-start-to-manual-finish";
  caseName: string;
  prompt: string;
  startedAt: string;
  finishedAt: string;
  timing: {
    durationMs: number;
    timeToFirstToolCallMs?: number;
    toolExecutionMs: number;
    nonToolDurationMs: number;
    timeAfterLastToolCallMs?: number;
    toolCallCount: number;
  };
  toolSpans: RealRunToolSpan[];
};

type ActiveTrace = {
  id: string;
  caseName: string;
  prompt: string;
  startedAt: string;
  startedAtMonotonic: number;
  toolSpans: RealRunToolSpan[];
};

type TracerDependencies = {
  now?: () => number;
  wallNow?: () => Date;
  id?: () => string;
};

type ToolSpanInput = {
  name: string;
  outcome: RealRunToolOutcome;
  startedAt: number;
  durationMs: number;
};

const roundMilliseconds = (value: number) => Math.max(0, Math.round(value * 100) / 100);

export function createRealRunTracer(dependencies: TracerDependencies = {}) {
  const now = dependencies.now ?? (() => performance.now());
  const wallNow = dependencies.wallNow ?? (() => new Date());
  const createId = dependencies.id ?? (() => crypto.randomUUID());
  let active: ActiveTrace | null = null;

  return {
    isActive() {
      return active !== null;
    },
    start(input: { caseName: string; prompt: string }) {
      if (active) throw new Error("A real-run trace is already active.");
      active = {
        id: createId(),
        caseName: input.caseName,
        prompt: input.prompt,
        startedAt: wallNow().toISOString(),
        startedAtMonotonic: now(),
        toolSpans: [],
      };
    },
    recordTool(input: ToolSpanInput) {
      if (!active) return;
      active.toolSpans.push({
        name: input.name,
        outcome: input.outcome,
        startOffsetMs: roundMilliseconds(input.startedAt - active.startedAtMonotonic),
        durationMs: roundMilliseconds(input.durationMs),
      });
    },
    finish(input: { outcome: RealRunOutcome } = { outcome: "unverified" }): RealRunTrace {
      if (!active) throw new Error("No real-run trace is active.");
      const finished = active;
      active = null;
      const durationMs = roundMilliseconds(now() - finished.startedAtMonotonic);
      const toolSpans = [...finished.toolSpans].sort((left, right) => left.startOffsetMs - right.startOffsetMs);
      const toolExecutionMs = roundMilliseconds(
        toolSpans.reduce((total, span) => total + span.durationMs, 0),
      );
      const firstTool = toolSpans[0];
      const lastToolFinishedAt = toolSpans.reduce(
        (latest, span) => Math.max(latest, span.startOffsetMs + span.durationMs),
        0,
      );

      return {
        schemaVersion: "1.0",
        id: finished.id,
        source: "chatgpt-in-app-browser",
        outcome: input.outcome,
        measurementWindow: "manual-start-to-manual-finish",
        caseName: finished.caseName,
        prompt: finished.prompt,
        startedAt: finished.startedAt,
        finishedAt: wallNow().toISOString(),
        timing: {
          durationMs,
          ...(firstTool ? { timeToFirstToolCallMs: firstTool.startOffsetMs } : {}),
          toolExecutionMs,
          nonToolDurationMs: roundMilliseconds(durationMs - toolExecutionMs),
          ...(toolSpans.length > 0
            ? { timeAfterLastToolCallMs: roundMilliseconds(durationMs - lastToolFinishedAt) }
            : {}),
          toolCallCount: toolSpans.length,
        },
        toolSpans,
      };
    },
  };
}

export const realRunTracer = createRealRunTracer();
