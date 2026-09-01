import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";
import { changeReceiptSchema } from "../src/receipts/schema";

describe("application-authored receipts", () => {
  it("describes the committed delta and undo restores the original graph", () => {
    const store = createWorkflowStore();
    const before = structuredClone(store.getState().workflow);
    const receipt = store.getState().apply(0, [
      { type: "createNode", node: { id: "notify-sales", type: "action", label: "Notify sales", position: { x: 900, y: 100 }, properties: {} } },
      { type: "replaceConnection", edgeId: "edge-opportunity-end", replacement: [
        { id: "edge-opportunity-notify", source: "create-opportunity", sourcePort: "success", target: "notify-sales", targetPort: "input" },
        { id: "edge-notify-complete", source: "notify-sales", sourcePort: "success", target: "complete", targetPort: "input" },
      ] },
    ], "Add Notify sales after Create CRM opportunity");

    expect(changeReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(receipt.summary).toBe("Created Notify sales and changed 3 connections. Workflow validation passed.");
    expect(receipt.changes.map((change) => change.action)).toEqual(["created", "connected", "connected", "disconnected"]);

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
