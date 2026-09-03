import { afterEach, describe, expect, it } from "vitest";
import { installSessionPersistence } from "../src/state/sessionPersistence";
import { createWorkflowStore } from "../src/state/workflowStore";

const SESSION_KEY = "workflow-evidence-session-v6-empty-canvas";

afterEach(() => {
  window.sessionStorage.clear();
});

describe("workflow session persistence", () => {
  it("preserves a legacy canvas while treating its positions as user-owned", () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      workflow: {
        revision: 4,
        nodes: [{
          id: "placed",
          type: "action",
          label: "Placed",
          properties: {},
          position: { x: 640, y: 360 },
        }],
        edges: [],
      },
    }));
    const store = createWorkflowStore();

    installSessionPersistence(store);

    expect(store.getState().workflow.nodes[0].position).toEqual({ x: 640, y: 360 });
    expect(store.getState().autoLayoutNodeIds).toEqual([]);
  });

  it("ignores malformed automatic-layout ownership metadata", () => {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      workflow: { revision: 0, nodes: [], edges: [] },
      autoLayoutNodeIds: { invalid: true },
    }));
    const store = createWorkflowStore();

    expect(() => installSessionPersistence(store)).not.toThrow();
    expect(store.getState().autoLayoutNodeIds).toEqual([]);
  });
});
