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
import { jsonSchemas } from "../src/webmcp/toolSchemas";

const call = (functionName: string, result: unknown = {}, args: unknown = {}) => ({ functionName, args, result });
const completedEdit = (baseRevision: number, changeCount: number) => ({
  operationId: "operation-1",
  status: "completed",
  baseRevision,
  resultingRevision: baseRevision + 1,
  changeCount,
});
const failedEdit = (baseRevision: number) => call(
  "edit_workflow",
  { ok: false, error: { code: "INVALID_INPUT" } },
  { baseRevision, commands: [] },
);
const allPass = (expectedCall: unknown[], actualCalls: unknown[]) =>
  evaluateExecutionTrajectory(expectedCall, actualCalls).every((result: { outcome: string }) => result.outcome === "pass");
const expectedFunctionCalls = (nodes: Array<Record<string, unknown>>): Array<Record<string, unknown>> => nodes.flatMap((node) => {
  if ("functionName" in node) return [node];
  return expectedFunctionCalls((node.ordered ?? node.unordered ?? []) as Array<Record<string, unknown>>);
});
const nonBrowserUiActions = {
  async focusChangeEntry(operationId: string) {
    return { operationId, focusedIn: "change-history" as const, visible: true as const };
  },
  async focusWorkflowNode() {
    return { focused: true as const, visible: true as const };
  },
  async focusDomNode(selector: string) {
    return { selector, tagName: "button", id: null, focusWhen: "window-focus-or-accessibility-interaction" as const, queued: true as const };
  },
};

describe("WebMCP eval fixture", () => {
  it("uses the original suggested prompt for the complex real-run comparison", () => {
    const complexCase = evalCases.find((evalCase) => evalCase.outcomeType === "complex-branch-create");

    expect(complexCase?.messages[0]?.content).toBe(
      "Use the page's WebMCP tools to create a software bug triage workflow, from report intake through resolution and follow-up. Include duplicate detection, reproduction, severity and priority assessment, ownership, investigation, fixes, verification, release, closure, blocked cases, and regressions.",
    );
  });

  it("accepts position-free creates and canonical updates without focusing the receipt", async () => {
    const store = createWorkflowStore();
    const focusedOperations: string[] = [];
    const handlers = createToolHandlers(store, {
      async focusChangeEntry(operationId) {
        focusedOperations.push(operationId);
        return { operationId, focusedIn: "change-history", visible: true };
      },
      async focusWorkflowNode() {
        return { focused: true, visible: true };
      },
      async focusDomNode(selector) {
        return { selector, tagName: "button", id: null, focusWhen: "window-focus-or-accessibility-interaction", queued: true };
      },
    });

    const created = await handlers.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "draft", type: "action", label: "Draft" } },
        { type: "createNode", node: { id: "approve", type: "action", label: "Approve" } },
      ],
    });
    const updated = await handlers.edit_workflow({
      baseRevision: 1,
      commands: [
        { type: "updateNode", id: "approve", patch: { label: "Approved" } },
      ],
    });

    expect(created).toMatchObject({ status: "completed" });
    expect(updated).toMatchObject({ status: "completed" });
    expect(focusedOperations).toEqual([]);
    expect(store.getState().workflow.nodes).toEqual([
      expect.objectContaining({ id: "draft", position: { x: 100, y: 100 }, properties: {} }),
      expect.objectContaining({ id: "approve", label: "Approved", position: { x: 385, y: 100 }, properties: {} }),
    ]);
  });

  it("keeps the edit schema within the model-context budget", () => {
    expect(JSON.stringify(jsonSchemas.apply).length).toBeLessThan(2_800);
  });

  it("contains runnable cases that reference registered workflow tools", () => {
    const registeredTools = new Set(Object.values(toolNames));

    expect(evalCases.map((evalCase) => evalCase.outcomeType)).toEqual(supportedOutcomeTypes);
    for (const evalCase of evalCases) {
      expect(["create", "edit", "read", "interaction"]).toContain(evalCase.taskType);
      expect(evalCase.messages.some((message) => message.role === "user" && message.content.length > 0)).toBe(true);
      expect(evalCase.expectedCall.length).toBeGreaterThan(0);
      for (const call of [...(evalCase.setupCalls ?? []), ...expectedFunctionCalls(evalCase.expectedCall)]) {
        expect(registeredTools.has(call.functionName)).toBe(true);
        expect(call.arguments).toBeTypeOf("object");
      }
    }
  });

  it("states the direct-create and receipt stopping conditions in each prompt", () => {
    for (const evalCase of evalCases) {
      const prompt = evalCase.messages.find((message) => message.role === "user")!.content;
      expect(prompt).not.toContain("show me what changed");

      if (evalCase.outcomeType !== "complex-branch-create") {
        expect(prompt).toContain("The app will announce the change receipt automatically");
        expect(prompt).toContain("do not inspect or focus the receipt afterward");
      }

      if (evalCase.taskType === "create" && evalCase.outcomeType !== "complex-branch-create") {
        expect(prompt).toContain("The canvas is empty");
        expect(prompt).toContain("without calling discover_workflow first");
        expect(prompt).toContain("or supplying baseRevision");
      }
    }
  });

  it("runs every setup transaction against the current edit tool", async () => {
    for (const evalCase of evalCases) {
      const handlers = createToolHandlers(createWorkflowStore(), nonBrowserUiActions);
      for (const setupCall of evalCase.setupCalls ?? []) {
        expect(setupCall.functionName).toBe("edit_workflow");
        await expect(handlers.edit_workflow(setupCall.arguments)).resolves.toMatchObject({ status: "completed" });
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

  it("accepts direct edit and create trajectories without recovery or proof calls", () => {
    const editCase = evalCases.find((evalCase) => evalCase.taskType === "edit");
    const createCase = evalCases.find((evalCase) => evalCase.taskType === "create");
    expect(editCase).toBeDefined();
    expect(createCase).toBeDefined();

    const discovery = call("discover_workflow");
    const inspection = call("inspect_workflow_items", {}, { objects: [{ kind: "node", id: "approve-request" }] });
    const refreshedDiscovery = call("discover_workflow");
    const successfulEdit = call("edit_workflow", completedEdit(1, 2), { baseRevision: 1, commands: [] });
    const successfulCreate = call("edit_workflow", completedEdit(0, 3), { commands: [] });

    expect(allPass(editCase!.expectedCall, [discovery, inspection, successfulEdit])).toBe(true);
    expect(allPass(editCase!.expectedCall, [
      discovery,
      failedEdit(1),
      refreshedDiscovery,
      inspection,
      successfulEdit,
    ])).toBe(false);
    expect(allPass(createCase!.expectedCall, [successfulCreate])).toBe(true);
    expect(allPass(createCase!.expectedCall, [discovery, successfulCreate])).toBe(false);
    expect(allPass(createCase!.expectedCall, [
      discovery,
      failedEdit(0),
      refreshedDiscovery,
      successfulCreate,
    ])).toBe(false);
  });

  it("allows optional discovery before one large edit for the natural complex prompt", () => {
    const complexCase = evalCases.find((evalCase) => evalCase.outcomeType === "complex-branch-create")!;
    const calls = [
      call("discover_workflow"),
      call("edit_workflow", completedEdit(0, 28), { baseRevision: 0, commands: [] }),
    ];

    expect(allPass(complexCase.expectedCall, calls)).toBe(true);
    expect(allPass(complexCase.expectedCall, [
      ...calls,
      call("edit_workflow", completedEdit(1, 1), { baseRevision: 1, commands: [] }),
    ])).toBe(false);
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

  it("preserves aggregate model-step timing and token usage", () => {
    const timing = buildTiming(
      {
        durationMs: 8_000,
        modelExecutionMs: 7_900,
        modelStepCount: 3,
        inputTokenCount: 12_000,
        outputTokenCount: 900,
        toolSchemaCharacterCount: 24_000,
        toolAttempts: [],
      },
      [],
      [],
      8_000,
    );

    expect(timing).toMatchObject({
      modelExecutionMs: 7_900,
      modelStepCount: 3,
      inputTokenCount: 12_000,
      outputTokenCount: 900,
      toolSchemaCharacterCount: 24_000,
    });
  });

  it("accepts the required trajectories for complex creation, rerouting, and pagination", () => {
    const byOutcome = new Map(evalCases.map((evalCase) => [evalCase.outcomeType, evalCase]));
    const discovery = call("discover_workflow");
    const refreshedDiscovery = call("discover_workflow");

    const complexCase = byOutcome.get("complex-branch-create")!;
    const complexEdit = call("edit_workflow", completedEdit(0, 20), { baseRevision: 0, commands: [] });
    expect(allPass(complexCase.expectedCall, [complexEdit])).toBe(true);
    expect(allPass(complexCase.expectedCall, [discovery, complexEdit])).toBe(true);
    expect(allPass(complexCase.expectedCall, [
      discovery,
      failedEdit(0),
      refreshedDiscovery,
      complexEdit,
    ])).toBe(false);

    const rerouteCase = byOutcome.get("connection-reroute")!;
    const edgeInspection = call("inspect_workflow_items", {
      returnedCount: 1,
      items: [{ kind: "workflow-edge", id: "edge-receive-archive" }],
    }, {
      objects: [{ kind: "workflow-edge", id: "edge-receive-archive" }],
      detail: "relationships",
    });
    const rerouteEdit = call("edit_workflow", completedEdit(1, 2), { baseRevision: 1, commands: [] });
    expect(allPass(rerouteCase.expectedCall, [discovery, edgeInspection, rerouteEdit])).toBe(true);
    const edgePropertiesInspection = call("inspect_workflow_items", {
      returnedCount: 1,
      items: [{ kind: "workflow-edge", id: "edge-receive-archive" }],
    }, {
      objects: [{ kind: "workflow-edge", id: "edge-receive-archive" }],
      detail: "properties",
    });
    expect(allPass(rerouteCase.expectedCall, [discovery, edgePropertiesInspection, rerouteEdit])).toBe(true);
    const contextualInspection = call("inspect_workflow_items", {
      returnedCount: 3,
      items: [{ kind: "workflow-edge", id: "edge-receive-archive" }],
    }, {
      objects: [
        { kind: "workflow-node", id: "receive-request" },
        { kind: "workflow-node", id: "manual-review" },
        { kind: "workflow-edge", id: "edge-receive-archive" },
      ],
      detail: "relationships",
    });
    const inPlaceReroute = call("edit_workflow", completedEdit(1, 1), { baseRevision: 1, commands: [] });
    expect(allPass(rerouteCase.expectedCall, [discovery, contextualInspection, inPlaceReroute])).toBe(true);
    const failedInspection = call("inspect_workflow_items", { ok: false, error: { code: "INVALID_INPUT" } }, {});
    expect(allPass(rerouteCase.expectedCall, [discovery, failedInspection, inPlaceReroute])).toBe(false);
    const oversizedReroute = call("edit_workflow", completedEdit(1, 3), { baseRevision: 1, commands: [] });
    expect(allPass(rerouteCase.expectedCall, [discovery, contextualInspection, oversizedReroute])).toBe(false);
    expect(allPass(rerouteCase.expectedCall, [
      discovery,
      contextualInspection,
      call("inspect_workflow_items", {}, { objects: [{ kind: "workflow-node", id: "manual-review" }] }),
      inPlaceReroute,
    ])).toBe(false);

    const paginationCase = byOutcome.get("paginated-routing-hub-edit")!;
    const hubObject = [{ kind: "workflow-node", id: "routing-hub" }];
    const paginatedCalls = [
      call("discover_workflow", {}, { limit: 4 }),
      call("discover_workflow", {}, { cursor: 4, limit: 4 }),
      call("inspect_workflow_items", {}, { objects: hubObject, detail: "relationships", limit: 3 }),
      call("inspect_workflow_items", {}, { objects: hubObject, detail: "relationships", cursor: 3, limit: 3 }),
      call("edit_workflow", completedEdit(1, 1), { baseRevision: 1, commands: [] }),
    ];
    expect(allPass(paginationCase.expectedCall, paginatedCalls)).toBe(true);
  });

  it("makes the large workflow require both discovery and relationship pagination", async () => {
    const evalCase = evalCases.find((candidate) => candidate.outcomeType === "paginated-routing-hub-edit")!;
    const handlers = createToolHandlers(createWorkflowStore(), nonBrowserUiActions);
    await handlers.edit_workflow(evalCase.setupCalls![0].arguments);

    const firstDiscovery = fitToolOutput("discover_workflow", { limit: 4 }, handlers.discover_workflow({ limit: 4 }));
    const secondDiscovery = fitToolOutput(
      "discover_workflow",
      { cursor: 4, limit: 4 },
      handlers.discover_workflow({ cursor: 4, limit: 4 }),
    );
    expect(firstDiscovery).toMatchObject({ itemPage: { nextCursor: 4 } });
    expect(secondDiscovery).toMatchObject({
      itemPage: {
        items: expect.arrayContaining([expect.objectContaining({ id: "routing-hub" })]),
      },
    });
    expect(secondDiscovery).not.toHaveProperty("nodeTypes");
    expect(secondDiscovery).not.toHaveProperty("uiTargets");
    expect(secondDiscovery).not.toHaveProperty("nextCalls");

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
