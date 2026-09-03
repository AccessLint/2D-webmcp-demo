import { describe, expect, it } from "vitest";
import {
  buildTiming,
  collectAllowedToolNames,
} from "webmcp-evals/dist/evaluator/browserEvaluator.js";
import { evaluateExecutionTrajectory } from "webmcp-evals/dist/utils.js";
import evalCases from "./webmcp-evals.json";
import { toolNames } from "../src/webmcp/toolNames";

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

    expect(evalCases.map((evalCase) => evalCase.taskType)).toEqual(["edit", "create"]);
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
});
