import { describe, expect, it } from "vitest";
import {
  buildTiming,
  collectAllowedToolNames,
} from "webmcp-evals/dist/evaluator/browserEvaluator.js";
import { evaluateExecutionTrajectory } from "webmcp-evals/dist/utils.js";
import evalCases from "./webmcp-evals.json";
import { supportedOutcomeTypes } from "./taskOutcome.mjs";
import { createWorkflowStore } from "../src/state/workflowStore";
import { createToolHandlers } from "../src/webmcp/toolHandlers";
import { toolNames } from "../src/webmcp/toolNames";
import { fitToolOutput } from "../src/webmcp/toolOutputs";

const call = (functionName: string, result: unknown = {}, args: unknown = {}) => ({ functionName, args, result });
const completedEdit = (baseRevision: number, changeCount: number) => ({
  operationId: "operation-1",
  status: "completed",
  baseRevision,
  resultingRevision: baseRevision + 1,
  changeCount,
  nextCall: { tool: "show_edit_result", input: { operationId: "operation-1" } },
});
const failedEdit = (baseRevision: number) => call(
  "edit_workflow",
  { ok: false, error: { code: "INVALID_INPUT" } },
  { baseRevision, commands: [] },
);
const shownEdit = call(
  "show_edit_result",
  { status: "completed", visible: true },
  { operationId: "operation-1" },
);
const allPass = (expectedCall: unknown[], actualCalls: unknown[]) =>
  evaluateExecutionTrajectory(expectedCall, actualCalls).every((result: { outcome: string }) => result.outcome === "pass");

describe("WebMCP eval fixture", () => {
  it("contains runnable cases that reference registered workflow tools", () => {
    const registeredTools = new Set(Object.values(toolNames));

    expect(evalCases.map((evalCase) => evalCase.outcomeType)).toEqual(supportedOutcomeTypes);
    for (const evalCase of evalCases) {
      expect(["create", "edit", "read", "interaction"]).toContain(evalCase.taskType);
      expect(evalCase.messages.some((message) => message.role === "user" && message.content.length > 0)).toBe(true);
      expect(evalCase.expectedCall.length).toBeGreaterThan(0);
      for (const call of [...(evalCase.setupCalls ?? []), ...evalCase.expectedCall]) {
        expect(registeredTools.has(call.functionName)).toBe(true);
        expect(call.arguments).toBeTypeOf("object");
      }
    }
  });

  it("runs every setup transaction against the current edit tool", () => {
    for (const evalCase of evalCases) {
      const handlers = createToolHandlers(createWorkflowStore());
      for (const setupCall of evalCase.setupCalls ?? []) {
        expect(setupCall.functionName).toBe("edit_workflow");
        expect(handlers.edit_workflow(setupCall.arguments)).toMatchObject({ status: "completed" });
      }
      if (evalCase.outcomeType === "connection-reroute") {
        const discovery = fitToolOutput("discover_workflow", {}, handlers.discover_workflow({}));
        expect(discovery).toMatchObject({
          itemPage: {
            items: expect.arrayContaining([expect.objectContaining({ id: "edge-receive-archive" })]),
          },
        });
      }
    }
  });

  it("accepts the current successful and recoverable tool trajectories for edit and create cases", () => {
    const editCase = evalCases.find((evalCase) => evalCase.taskType === "edit");
    const createCase = evalCases.find((evalCase) => evalCase.taskType === "create");
    expect(editCase).toBeDefined();
    expect(createCase).toBeDefined();

    const discovery = call("discover_workflow");
    const inspection = call("inspect_workflow_items", {}, { objects: [{ kind: "node", id: "approve-request" }] });
    const refreshedDiscovery = call("discover_workflow");
    const successfulEdit = call("edit_workflow", completedEdit(1, 2), { baseRevision: 1, commands: [] });
    const successfulCreate = call("edit_workflow", completedEdit(0, 3), { baseRevision: 0, commands: [] });

    expect(allPass(editCase!.expectedCall, [discovery, inspection, successfulEdit, shownEdit])).toBe(true);
    expect(allPass(editCase!.expectedCall, [
      discovery,
      failedEdit(1),
      refreshedDiscovery,
      inspection,
      successfulEdit,
      shownEdit,
    ])).toBe(true);
    expect(allPass(createCase!.expectedCall, [discovery, successfulCreate, shownEdit])).toBe(true);
    expect(allPass(createCase!.expectedCall, [
      discovery,
      failedEdit(0),
      refreshedDiscovery,
      successfulCreate,
      shownEdit,
    ])).toBe(true);
  });

  it("counts recovery retries separately without hiding redundant rediscovery", () => {
    const editCase = evalCases.find((evalCase) => evalCase.taskType === "edit");
    expect(editCase).toBeDefined();
    const toolAttempts = [
      { functionName: "discover_workflow", succeeded: true },
      { functionName: "edit_workflow", succeeded: false },
      { functionName: "discover_workflow", succeeded: true },
      { functionName: "inspect_workflow_items", succeeded: true },
      { functionName: "edit_workflow", succeeded: true },
      { functionName: "show_edit_result", succeeded: true },
    ];

    const timing = buildTiming(
      { durationMs: 1_000, toolAttempts },
      collectAllowedToolNames(editCase!.expectedCall),
      toolAttempts.map((attempt) => attempt.functionName),
      1_000,
    );

    expect(timing.retryToolCallCount).toBe(1);
    expect(timing.redundantToolCallCount).toBe(1);

    const duplicateSuccessfulEdit = [
      { functionName: "discover_workflow", succeeded: true },
      { functionName: "edit_workflow", succeeded: true },
      { functionName: "edit_workflow", succeeded: true },
      { functionName: "show_edit_result", succeeded: true },
    ];
    const duplicateTiming = buildTiming(
      { durationMs: 1_000, toolAttempts: duplicateSuccessfulEdit },
      collectAllowedToolNames(editCase!.expectedCall),
      duplicateSuccessfulEdit.map((attempt) => attempt.functionName),
      1_000,
    );

    expect(duplicateTiming.retryToolCallCount).toBe(0);
    expect(duplicateTiming.redundantToolCallCount).toBe(1);
  });

  it("accepts the required trajectories for complex creation, rerouting, and pagination", () => {
    const byOutcome = new Map(evalCases.map((evalCase) => [evalCase.outcomeType, evalCase]));
    const discovery = call("discover_workflow");
    const refreshedDiscovery = call("discover_workflow");

    const complexCase = byOutcome.get("complex-branch-create")!;
    const complexEdit = call("edit_workflow", completedEdit(0, 20), { baseRevision: 0, commands: [] });
    expect(allPass(complexCase.expectedCall, [discovery, complexEdit, shownEdit])).toBe(true);
    expect(allPass(complexCase.expectedCall, [
      discovery,
      failedEdit(0),
      refreshedDiscovery,
      complexEdit,
      shownEdit,
    ])).toBe(true);

    const rerouteCase = byOutcome.get("connection-reroute")!;
    const edgeInspection = call("inspect_workflow_items", {}, {
      objects: [{ kind: "workflow-edge", id: "edge-receive-archive" }],
    });
    const rerouteEdit = call("edit_workflow", completedEdit(1, 2), { baseRevision: 1, commands: [] });
    expect(allPass(rerouteCase.expectedCall, [discovery, edgeInspection, rerouteEdit, shownEdit])).toBe(true);

    const paginationCase = byOutcome.get("paginated-routing-hub-edit")!;
    const hubObject = [{ kind: "workflow-node", id: "routing-hub" }];
    const paginatedCalls = [
      call("discover_workflow", {}, { limit: 4 }),
      call("discover_workflow", {}, { cursor: 4, limit: 4 }),
      call("inspect_workflow_items", {}, { objects: hubObject, detail: "relationships", limit: 3 }),
      call("inspect_workflow_items", {}, { objects: hubObject, detail: "relationships", cursor: 3, limit: 3 }),
      call("edit_workflow", completedEdit(1, 1), { baseRevision: 1, commands: [] }),
      shownEdit,
    ];
    expect(allPass(paginationCase.expectedCall, paginatedCalls)).toBe(true);
  });

  it("makes the large workflow require both discovery and relationship pagination", () => {
    const evalCase = evalCases.find((candidate) => candidate.outcomeType === "paginated-routing-hub-edit")!;
    const handlers = createToolHandlers(createWorkflowStore());
    handlers.edit_workflow(evalCase.setupCalls![0].arguments);

    const firstDiscovery = fitToolOutput("discover_workflow", { limit: 4 }, handlers.discover_workflow({ limit: 4 }));
    const secondDiscovery = fitToolOutput(
      "discover_workflow",
      { cursor: 4, limit: 4 },
      handlers.discover_workflow({ cursor: 4, limit: 4 }),
    );
    expect(firstDiscovery).toMatchObject({ itemPage: { cursor: 0, nextCursor: 4 } });
    expect(secondDiscovery).toMatchObject({
      itemPage: {
        cursor: 4,
        items: expect.arrayContaining([expect.objectContaining({ id: "routing-hub" })]),
      },
    });

    const objects = [{ kind: "workflow-node" as const, id: "routing-hub" }];
    const firstInspection = fitToolOutput(
      "inspect_workflow_items",
      { objects, detail: "relationships", limit: 3 },
      handlers.inspect_workflow_items({ objects, detail: "relationships", limit: 3 }),
    );
    const secondInspection = fitToolOutput(
      "inspect_workflow_items",
      { objects, detail: "relationships", cursor: 3, limit: 3 },
      handlers.inspect_workflow_items({ objects, detail: "relationships", cursor: 3, limit: 3 }),
    );
    expect(firstInspection).toMatchObject({
      items: [expect.objectContaining({
        relationshipCount: 6,
        relationshipPage: expect.objectContaining({ cursor: 0, nextCursor: 3 }),
      })],
    });
    expect(secondInspection).toMatchObject({
      items: [expect.objectContaining({
        relationshipPage: expect.objectContaining({ cursor: 3, nextCursor: null }),
      })],
    });
  });
});
