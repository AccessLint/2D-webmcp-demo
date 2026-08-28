import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";
import { createToolHandlers } from "../src/webmcp/toolHandlers";

describe("WebMCP tool boundary", () => {
  it("reads, edits, retrieves, focuses, reveals, and undoes through application state", async () => {
    const store = createWorkflowStore();
    let focusedOperationId: string | null = null;
    let focusedNodeId: string | null = null;
    const tools = createToolHandlers(store, {
      focusChangeEntry: async (operationId) => {
        focusedOperationId = operationId;
        return { operationId, focusedIn: "change-history", visible: true };
      },
      focusWorkflowNode: async (nodeId) => {
        focusedNodeId = nodeId;
        return { focused: true, visible: true };
      },
    });
    expect(tools.get_workflow_summary({})).toMatchObject({ revision: 0, nodes: 5, edges: 3 });

    const receipt = tools.apply_workflow_changes({
      baseRevision: 0,
      intent: "Add a Retry step after Fetch Orders",
      commands: [
        { type: "createNode", node: { id: "retry", type: "retry", label: "Retry", position: { x: 500, y: 200 }, properties: { attempts: 3 } } },
        { type: "replaceConnection", edgeId: "edge-fetch-save", replacement: [
          { id: "edge-fetch-retry", source: "fetch-orders", sourcePort: "success", target: "retry", targetPort: "input" },
          { id: "edge-retry-save", source: "retry", sourcePort: "success", target: "save-results", targetPort: "input" },
          { id: "edge-retry-alert", source: "retry", sourcePort: "failure", target: "alert-team", targetPort: "input" },
        ] },
      ],
    });
    expect(tools.get_change_receipt({ operationId: receipt.operationId })).toEqual(receipt);
    await expect(tools.focus_change_entry({ operationId: receipt.operationId })).resolves.toMatchObject({ operationId: receipt.operationId, summary: receipt.summary, focusedIn: "change-history", visible: true });
    expect(focusedOperationId).toBe(receipt.operationId);
    expect(tools.inspect_workflow_objects({ objects: [{ kind: "workflow-node", id: "retry" }] })[0]).toMatchObject({ label: "Retry", properties: { attempts: 3 } });
    await expect(tools.reveal_workflow_object({ kind: "workflow-node", id: "retry" })).resolves.toMatchObject({ id: "retry", label: "Retry", focused: true, visible: true });
    expect(focusedNodeId).toBe("retry");
    expect(store.getState().selected).toEqual({ kind: "node", id: "retry" });
    expect(tools.undo_workflow_change({ operationId: receipt.operationId }).summary).toContain("Undid");
  });

  it("returns application evidence for a stale edit without changing the graph", () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store);
    const receipt = tools.apply_workflow_changes({ baseRevision: 4, commands: [{ type: "deleteNode", id: "fetch-orders" }] });
    expect(receipt).toMatchObject({ status: "conflict", baseRevision: 4, resultingRevision: 0, changes: [], undo: { available: false } });
    expect(store.getState().workflow.revision).toBe(0);
    expect(tools.get_change_receipt({ operationId: receipt.operationId })).toEqual(receipt);
  });

  it("does not request focus for a missing change entry", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store);
    await expect(tools.focus_change_entry({ operationId: "missing" })).rejects.toThrow("Receipt missing does not exist");
  });
});
