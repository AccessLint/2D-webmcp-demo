import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";

describe("default canvas state", () => {
  it("starts empty and resets back to an empty canvas", () => {
    const store = createWorkflowStore();

    expect(store.getState().workflow).toEqual({ revision: 0, nodes: [], edges: [] });
    expect(store.getState().selected).toBeNull();

    store.getState().apply(0, [{
      type: "createNode",
      node: {
        id: "arrival",
        type: "node",
        label: "Patient arrives",
        position: { x: 0, y: 0 },
        properties: {},
      },
    }]);
    store.getState().reset();

    expect(store.getState().workflow).toEqual({ revision: 0, nodes: [], edges: [] });
    expect(store.getState().selected).toBeNull();
  });
});
