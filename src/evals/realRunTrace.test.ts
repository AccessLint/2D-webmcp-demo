import { describe, expect, it } from "vitest";
import { createRealRunTracer } from "./realRunTrace";

describe("real run tracing", () => {
  it("measures prompt-to-final time and the tool spans within it", () => {
    let monotonicNow = 1_000;
    const tracer = createRealRunTracer({
      now: () => monotonicNow,
      wallNow: () => new Date("2026-09-03T12:00:00.000Z"),
      id: () => "real-run-1",
    });

    tracer.start({
      caseName: "Create a complex multi-branch bug workflow",
      prompt: "Create the workflow.",
    });
    tracer.recordTool({
      name: "edit_workflow",
      startedAt: 1_500,
      durationMs: 100,
      outcome: "completed",
    });
    monotonicNow = 3_000;

    expect(tracer.finish({ outcome: "success" })).toEqual({
      schemaVersion: "1.0",
      id: "real-run-1",
      source: "chatgpt-in-app-browser",
      outcome: "success",
      measurementWindow: "manual-start-to-manual-finish",
      caseName: "Create a complex multi-branch bug workflow",
      prompt: "Create the workflow.",
      startedAt: "2026-09-03T12:00:00.000Z",
      finishedAt: "2026-09-03T12:00:00.000Z",
      timing: {
        durationMs: 2_000,
        timeToFirstToolCallMs: 500,
        toolExecutionMs: 100,
        nonToolDurationMs: 1_900,
        timeAfterLastToolCallMs: 1_400,
        toolCallCount: 1,
      },
      toolSpans: [{
        name: "edit_workflow",
        outcome: "completed",
        startOffsetMs: 500,
        durationMs: 100,
      }],
    });
  });

  it("orders parallel tool spans by start and measures after the final completion", () => {
    let monotonicNow = 0;
    const tracer = createRealRunTracer({
      now: () => monotonicNow,
      wallNow: () => new Date(0),
      id: () => "parallel-run",
    });
    tracer.start({ caseName: "Parallel case", prompt: "Run tools." });
    tracer.recordTool({ name: "fast", startedAt: 500, durationMs: 100, outcome: "completed" });
    tracer.recordTool({ name: "slow", startedAt: 100, durationMs: 1_000, outcome: "completed" });
    monotonicNow = 2_000;

    const trace = tracer.finish();

    expect(trace.toolSpans.map((span) => span.name)).toEqual(["slow", "fast"]);
    expect(trace.timing.timeToFirstToolCallMs).toBe(100);
    expect(trace.timing.timeAfterLastToolCallMs).toBe(900);
  });
});
