import assert from "node:assert/strict";
import test from "node:test";
import { buildLatencyReport, distribution } from "./latencyReport.mjs";
import { hasVerifiedTaskOutcome } from "./taskOutcome.mjs";

function completedEditAttempt({ outcomeType, taskType, baseRevision, commands }) {
  const operationId = `${outcomeType}-operation`;
  const editResult = {
    operationId,
    status: "completed",
    baseRevision,
    resultingRevision: baseRevision + 1,
    changeCount: commands.length,
    nextCall: { tool: "show_edit_result", input: { operationId } },
  };
  return {
    outcomeType,
    taskType,
    results: [
      {
        response: {
          functionName: "edit_workflow",
          args: { baseRevision, commands },
          result: editResult,
        },
      },
      {
        response: {
          functionName: "show_edit_result",
          args: { operationId },
          result: { operationId, status: "completed", visible: true },
        },
      },
    ],
  };
}

test("distribution reports nearest-rank p50 and p95", () => {
  assert.deepEqual(distribution([100, 200, 300, 400]), {
    count: 4,
    min: 100,
    mean: 250,
    p50: 200,
    p95: 400,
    max: 400,
  });
});

test("rejects unknown task categories instead of silently creating a group", () => {
  assert.throws(() => buildLatencyReport({ results: { results: [] } }, [
    { name: "Typo", taskType: "craete" },
  ]), /Unknown eval taskType "craete"/);
});

test("rejects unknown semantic outcome types", () => {
  assert.throws(() => buildLatencyReport({ results: { results: [] } }, [
    { name: "Typo", taskType: "create", outcomeType: "complex-brnch-create" },
  ]), /Unknown eval outcomeType "complex-brnch-create"/);
});

test("summarizes one timing record per run and allows extra read calls", () => {
  const shared = {
    test: {
      name: "Read diagram",
      expectedCall: [{ functionName: "discover_workflow", arguments: {} }],
    },
    runIndex: 1,
    timing: {
      durationMs: 12_000,
      timeToFirstToolCallMs: 3_000,
      toolExecutionMs: 200,
      nonToolDurationMs: 11_800,
      toolCallCount: 4,
      retryToolCallCount: 0,
      redundantToolCallCount: 1,
    },
  };
  const report = {
    config: { model: "test-model", runs: 1 },
    results: {
      results: [
        { ...shared, outcome: "pass" },
        { ...shared, test: { name: "Read diagram", expectedCall: null }, outcome: "fail" },
      ],
    },
  };
  const result = buildLatencyReport(report, [{ name: "Read diagram", taskType: "read" }]);

  assert.equal(result.all.attempts, 1);
  assert.equal(result.all.successfulAttempts, 1);
  assert.equal(result.all.metrics.durationMs.p50, 12_000);
  assert.equal(result.byTaskType.read.metrics.redundantToolCallCount.mean, 1);
});

test("excludes failed required trajectories from successful latency percentiles", () => {
  const report = {
    results: {
      results: [
        {
          test: { name: "Create diagram", taskType: "create", expectedCall: [{ functionName: "edit_workflow" }] },
          outcome: "fail",
          runIndex: 1,
          timing: { durationMs: 25_000, toolCallCount: 1, retryToolCallCount: 0, redundantToolCallCount: 0 },
        },
      ],
    },
  };
  const result = buildLatencyReport(report);

  assert.equal(result.all.successfulAttempts, 0);
  assert.equal(result.all.metrics.durationMs, null);
  assert.equal(result.byTaskType.create.metrics.toolCallCount.p50, 1);
});

test("requires a semantically valid notification edit and matching visible receipt", () => {
  const timing = { durationMs: 9_000, toolCallCount: 3, retryToolCallCount: 0, redundantToolCallCount: 0 };
  const editResult = {
    operationId: "op-1",
    status: "completed",
    baseRevision: 1,
    resultingRevision: 2,
    changeCount: 2,
    nextCall: { tool: "show_edit_result", input: { operationId: "op-1" } },
  };
  const required = (functionName, response) => ({
    test: { name: "Notification", taskType: "edit", expectedCall: [{ functionName }] },
    response,
    outcome: "pass",
    runIndex: 1,
    timing,
  });
  const report = {
    results: {
      results: [
        required("discover_workflow", { functionName: "discover_workflow", args: {}, result: {} }),
        required("edit_workflow", {
          functionName: "edit_workflow",
          args: {
            baseRevision: 1,
            commands: [
              {
                type: "createNode",
                node: { id: "notify", type: "action", label: "Notify requester" },
              },
              {
                type: "connect",
                edge: {
                  id: "notification",
                  source: "approve-request",
                  sourcePort: "success",
                  target: "notify",
                  targetPort: "input",
                },
              },
            ],
          },
          result: editResult,
        }),
        required("show_edit_result", {
          functionName: "show_edit_result",
          args: { operationId: "op-1" },
          result: { operationId: "op-1", status: "completed", visible: true },
        }),
      ],
    },
  };

  assert.equal(buildLatencyReport(report).byTaskType.edit.successfulAttempts, 1);
  report.results.results.push({
    test: { name: "Notification", taskType: "edit", expectedCall: null },
    response: {
      functionName: "undo_workflow_edit",
      args: { operationId: "op-1" },
      result: { status: "completed" },
    },
    outcome: "fail",
    runIndex: 1,
    timing,
  });
  assert.equal(buildLatencyReport(report).byTaskType.edit.successfulAttempts, 0);
});

test("does not reject a failed undo that leaves the completed edit in place", () => {
  const timing = { durationMs: 9_000, toolCallCount: 4, retryToolCallCount: 0, redundantToolCallCount: 1 };
  const editResult = {
    operationId: "op-1",
    status: "completed",
    baseRevision: 1,
    resultingRevision: 2,
    changeCount: 2,
    nextCall: { tool: "show_edit_result", input: { operationId: "op-1" } },
  };
  const resultFor = (functionName, response, expectedCall = [{ functionName }]) => ({
    test: { name: "Notification", taskType: "edit", expectedCall },
    response,
    outcome: expectedCall ? "pass" : "fail",
    runIndex: 1,
    timing,
  });
  const report = {
    results: {
      results: [
        resultFor("edit_workflow", {
          functionName: "edit_workflow",
          args: { baseRevision: 1, commands: [
            { type: "createNode", node: { id: "notify", type: "action", label: "Notify requester" } },
            { type: "connect", edge: { source: "approve-request", sourcePort: "success", target: "notify", targetPort: "input" } },
          ] },
          result: editResult,
        }),
        resultFor("show_edit_result", {
          functionName: "show_edit_result",
          args: { operationId: "op-1" },
          result: { status: "completed", visible: true },
        }),
        resultFor("undo_workflow_edit", {
          functionName: "undo_workflow_edit",
          args: { operationId: "op-1" },
          result: { status: "conflict" },
        }, null),
      ],
    },
  };

  assert.equal(buildLatencyReport(report).byTaskType.edit.successfulAttempts, 1);
});

test("requires creation to replace the original graph with the requested topology", () => {
  const operationId = "create-op";
  const timing = { durationMs: 15_000, toolCallCount: 3, retryToolCallCount: 0, redundantToolCallCount: 0 };
  const edit = {
    functionName: "edit_workflow",
    args: {
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "draft", label: "Draft request", type: "action" } },
        { type: "createNode", node: { id: "approve", label: "Approve request", type: "action" } },
        { type: "connect", edge: { id: "approval", source: "draft", sourcePort: "success", target: "approve", targetPort: "input" } },
      ],
    },
    result: {
      operationId,
      status: "completed",
      baseRevision: 0,
      resultingRevision: 1,
      changeCount: 3,
      nextCall: { tool: "show_edit_result", input: { operationId } },
    },
  };
  const resultFor = (functionName, response) => ({
    test: { name: "Approval", taskType: "create", expectedCall: [{ functionName }] },
    response,
    outcome: "pass",
    runIndex: 1,
    timing,
  });
  const report = {
    results: {
      results: [
        resultFor("discover_workflow", { functionName: "discover_workflow", args: {}, result: {} }),
        resultFor("edit_workflow", edit),
        resultFor("show_edit_result", {
          functionName: "show_edit_result",
          args: { operationId },
          result: { operationId, status: "completed", visible: true },
        }),
      ],
    },
  };

  assert.equal(buildLatencyReport(report).byTaskType.create.successfulAttempts, 1);
  edit.args.commands = edit.args.commands.filter((command) =>
    command.type !== "createNode" || command.node.label !== "Approve request");
  assert.equal(buildLatencyReport(report).byTaskType.create.successfulAttempts, 0);
});

test("requires every node and branch in the complex workflow", () => {
  const node = (id, type, label) => ({
    type: "createNode",
    node: { id, type, label, position: { x: 0, y: 0 } },
  });
  const edge = (id, source, sourcePort, target) => ({
    type: "connect",
    edge: { id, source, sourcePort, target, targetPort: "input" },
  });
  const commands = [
    node("intake", "input", "Report intake"),
    node("triage", "action", "Triage report"),
    node("reproducible", "condition", "Reproducible?"),
    node("investigate", "action", "Investigate bug"),
    node("fix", "action", "Fix bug"),
    node("verified", "condition", "Verification passed?"),
    node("release", "end", "Release fix"),
    node("details", "action", "Request more details"),
    node("incomplete", "end", "Close incomplete"),
    edge("intake-triage", "intake", "data", "triage"),
    edge("triage-reproducible", "triage", "success", "reproducible"),
    edge("reproducible-investigate", "reproducible", "yes", "investigate"),
    edge("reproducible-details", "reproducible", "no", "details"),
    edge("investigate-fix", "investigate", "success", "fix"),
    edge("investigate-incomplete", "investigate", "failure", "incomplete"),
    edge("fix-verified", "fix", "success", "verified"),
    edge("fix-incomplete", "fix", "failure", "incomplete"),
    edge("verified-release", "verified", "yes", "release"),
    edge("verified-fix", "verified", "no", "fix"),
    edge("details-incomplete", "details", "success", "incomplete"),
  ];
  const attempt = completedEditAttempt({
    outcomeType: "complex-branch-create",
    taskType: "create",
    baseRevision: 0,
    commands,
  });

  assert.equal(hasVerifiedTaskOutcome(attempt, true), true);
  commands.pop();
  assert.equal(hasVerifiedTaskOutcome(attempt, true), false);
});

test("uses fixture outcome metadata when summarizing semantic success", () => {
  const commands = [
    { type: "updateNode", id: "routing-hub", patch: { label: "Reviewed routing hub" } },
  ];
  const attempt = completedEditAttempt({
    outcomeType: "paginated-routing-hub-edit",
    taskType: "edit",
    baseRevision: 1,
    commands,
  });
  const timing = {
    durationMs: 1_000,
    toolCallCount: 2,
    retryToolCallCount: 0,
    redundantToolCallCount: 0,
  };
  const report = {
    results: {
      results: attempt.results.map(({ response }) => ({
        test: {
          name: "Paginated workflow",
          expectedCall: [{ functionName: response.functionName }],
        },
        response,
        outcome: "pass",
        runIndex: 1,
        timing,
      })),
    },
  };

  const summary = buildLatencyReport(report, [{
    name: "Paginated workflow",
    taskType: "edit",
    outcomeType: "paginated-routing-hub-edit",
  }]);
  assert.equal(summary.byTaskType.edit.successfulAttempts, 1);
});

test("requires the existing connection to be rerouted with replaceConnection", () => {
  const commands = [
    {
      type: "replaceConnection",
      edgeId: "edge-receive-archive",
      replacement: [
        {
          id: "edge-receive-review",
          source: "receive-request",
          sourcePort: "success",
          target: "manual-review",
          targetPort: "input",
        },
      ],
    },
  ];
  const attempt = completedEditAttempt({
    outcomeType: "connection-reroute",
    taskType: "edit",
    baseRevision: 1,
    commands,
  });

  assert.equal(hasVerifiedTaskOutcome(attempt, true), true);
  commands[0].type = "connect";
  assert.equal(hasVerifiedTaskOutcome(attempt, true), false);
});

test("requires the paginated inspection task to rename only the routing hub", () => {
  const commands = [
    {
      type: "updateNode",
      id: "routing-hub",
      patch: { label: "Reviewed routing hub" },
    },
  ];
  const attempt = completedEditAttempt({
    outcomeType: "paginated-routing-hub-edit",
    taskType: "edit",
    baseRevision: 1,
    commands,
  });

  assert.equal(hasVerifiedTaskOutcome(attempt, true), true);
  commands[0].id = "route-a";
  assert.equal(hasVerifiedTaskOutcome(attempt, true), false);
});
