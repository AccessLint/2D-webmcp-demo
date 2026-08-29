import { describe, expect, it } from "vitest";
import { createSeedWorkflow } from "../graph/seedWorkflow";
import { createWorkflowStore } from "../state/workflowStore";
import { workflowSurfaceReceipt } from "./surfaceReceipt";

describe("workflowSurfaceReceipt", () => {
  it("projects a successful native edit into the shared receipt contract", () => {
    const store = createWorkflowStore(createSeedWorkflow());
    const commands = [{ type: "updateNode" as const, id: "fetch-orders", patch: { label: "Fetch Orders v2" } }];
    const nativeReceipt = store.getState().apply(0, commands, "Rename the item");

    expect(workflowSurfaceReceipt(nativeReceipt, commands)).toEqual(expect.objectContaining({
      schemaVersion: "0.1",
      operationId: nativeReceipt.operationId,
      surfaceId: "workflow",
      status: "completed",
      atomic: true,
      documentVersionBefore: "0",
      documentVersionAfter: "1",
      effects: [{ commandIndex: 0, itemId: "fetch-orders", effect: "updated" }],
      undo: { availability: "operation-token", token: nativeReceipt.operationId },
      verification: "native-diff",
    }));
  });

  it("projects a revision conflict without inventing effects or undo", () => {
    const store = createWorkflowStore(createSeedWorkflow());
    const commands = [{ type: "updateNode" as const, id: "fetch-orders", patch: { label: "Fetch Orders v2" } }];
    const nativeReceipt = store.getState().apply(99, commands);

    expect(workflowSurfaceReceipt(nativeReceipt, commands)).toEqual(expect.objectContaining({
      status: "conflict",
      documentVersionBefore: "0",
      documentVersionAfter: "0",
      effects: [],
      undo: { availability: "none", token: null },
      verification: "native-result",
    }));
  });

  it("attributes relationships removed by a cascading node delete to that command", () => {
    const store = createWorkflowStore(createSeedWorkflow());
    store.getState().apply(0, [{
      type: "connect",
      edge: {
        id: "edge-fetch-alert",
        source: "fetch-orders",
        sourcePort: "failure",
        target: "alert-team",
        targetPort: "input",
      },
    }]);
    const commands = [{ type: "deleteNode" as const, id: "alert-team" }];
    const nativeReceipt = store.getState().apply(1, commands);

    expect(workflowSurfaceReceipt(nativeReceipt, commands).effects).toEqual([
      { commandIndex: 0, itemId: "alert-team", effect: "deleted" },
      { commandIndex: 0, relationshipId: "edge-fetch-alert", effect: "disconnected" },
    ]);
  });
});
