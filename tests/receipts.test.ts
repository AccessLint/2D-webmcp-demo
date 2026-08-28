import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";
import { changeReceiptSchema } from "../src/receipts/schema";

describe("application-authored receipts", () => {
  it("describes the committed delta and undo restores the original graph", () => {
    const store = createWorkflowStore();
    const before = structuredClone(store.getState().workflow);
    const receipt = store.getState().apply(0, [
      { type: "createNode", node: { id: "retry", type: "retry", label: "Retry", position: { x: 500, y: 200 }, properties: { attempts: 3 } } },
      { type: "replaceConnection", edgeId: "edge-fetch-save", replacement: [
        { id: "edge-fetch-retry", source: "fetch-orders", sourcePort: "success", target: "retry", targetPort: "input" },
        { id: "edge-retry-save", source: "retry", sourcePort: "success", target: "save-results", targetPort: "input" },
        { id: "edge-retry-alert", source: "retry", sourcePort: "failure", target: "alert-team", targetPort: "input" },
      ] },
    ], "Add retry after Fetch Orders");

    expect(changeReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(receipt.summary).toBe("Created Retry and changed 4 connections. Workflow validation passed.");
    expect(receipt.changes.map((change) => change.action)).toEqual(["created", "connected", "connected", "connected", "disconnected"]);

    const undoReceipt = store.getState().undo(receipt.operationId);
    expect(store.getState().workflow).toMatchObject({ nodes: before.nodes, edges: before.edges, revision: 2 });
    expect(undoReceipt.summary).toContain("Undid the previous workflow change");
  });

  it("refuses an undo after a later committed graph edit", () => {
    const store = createWorkflowStore();
    const first = store.getState().apply(0, [{ type: "updateNode", id: "fetch-orders", patch: { label: "Load Orders" } }]);
    store.getState().apply(1, [{ type: "updateNode", id: "save-results", patch: { label: "Store Results" } }]);
    expect(() => store.getState().undo(first.operationId)).toThrow("cannot be undone after a later workflow edit");
  });
});
