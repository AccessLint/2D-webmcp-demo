import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";
import { changeReceiptSchema } from "../src/receipts/schema";

describe("application-authored receipts", () => {
  it("describes the committed delta and undo restores the original graph", () => {
    const store = createWorkflowStore();
    const before = structuredClone(store.getState().workflow);
    const receipt = store.getState().apply(0, [
      { type: "createNode", node: { id: "retry", type: "retry", label: "Retry", position: { x: 500, y: 200 }, properties: { attempts: 3 } } },
      { type: "replaceConnection", edgeId: "edge-enrich-qualified", replacement: [
        { id: "edge-enrich-retry", source: "enrich-company", sourcePort: "success", target: "retry", targetPort: "input" },
        { id: "edge-retry-qualified", source: "retry", sourcePort: "success", target: "qualified-lead", targetPort: "input" },
        { id: "edge-retry-review", source: "retry", sourcePort: "failure", target: "manual-review", targetPort: "input" },
      ] },
    ], "Add retry after Enrich company");

    expect(changeReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(receipt.summary).toBe("Created Retry and changed 4 connections. Workflow validation passed.");
    expect(receipt.changes.map((change) => change.action)).toEqual(["created", "connected", "connected", "connected", "disconnected"]);

    const undoReceipt = store.getState().undo(receipt.operationId);
    expect(store.getState().workflow).toMatchObject({ nodes: before.nodes, edges: before.edges, revision: 2 });
    expect(undoReceipt.summary).toContain("Undid the previous workflow change");
  });

  it("refuses an undo after a later committed graph edit", () => {
    const store = createWorkflowStore();
    const first = store.getState().apply(0, [{ type: "updateNode", id: "enrich-company", patch: { label: "Enrich account" } }]);
    store.getState().apply(1, [{ type: "updateNode", id: "create-opportunity", patch: { label: "Create opportunity" } }]);
    expect(() => store.getState().undo(first.operationId)).toThrow("cannot be undone after a later workflow edit");
  });
});
