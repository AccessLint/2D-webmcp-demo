import { describe, expect, it, vi } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";
import { createToolHandlers } from "../src/webmcp/toolHandlers";
import type { UiActions } from "../src/webmcp/uiActions";

function uiActions(): UiActions {
  return {
    async focusChangeEntry(operationId) {
      return { operationId, focusedIn: "change-history", visible: true };
    },
    async focusWorkflowNode() {
      return { focused: true, visible: true };
    },
    async focusDomNode(selector) {
      return {
        selector,
        tagName: "button",
        id: null,
        focusWhen: "window-focus-or-accessibility-interaction",
        queued: true,
      };
    },
  };
}

describe("incremental agent node reveal", () => {
  it("finishes revealing nodes when animation frames are suspended", async () => {
    const canvas = document.createElement("div");
    canvas.className = "canvas-shell";
    document.body.append(canvas);
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions());
    let settled = false;

    try {
      const edit = tools.edit_workflow({
        baseRevision: 0,
        commands: [
          { type: "createNode", node: { id: "first", type: "action", label: "First" } },
          { type: "createNode", node: { id: "second", type: "action", label: "Second" } },
        ],
      }).then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(1_000);

      expect(settled).toBe(true);
      await edit;
      expect(store.getState().nodeReveal).toBeNull();
      expect(store.getState().workflow.nodes).toHaveLength(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("reveals created nodes one at a time while the graph remains atomically committed", async () => {
    const store = createWorkflowStore();
    const revealSteps: Array<{ pending: string[]; nodeCount: number; edgeCount: number; revision: number }> = [];
    const tools = createToolHandlers(store, uiActions(), {
      waitForNodeReveal: async () => {
        const state = store.getState();
        revealSteps.push({
          pending: state.nodeReveal?.pendingNodeIds ?? [],
          nodeCount: state.workflow.nodes.length,
          edgeCount: state.workflow.edges.length,
          revision: state.workflow.revision,
        });
      },
    });

    const receipt = await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "start", type: "start", label: "Start" } },
        { type: "createNode", node: { id: "review", type: "action", label: "Review" } },
        { type: "createNode", node: { id: "done", type: "end", label: "Done" } },
        {
          type: "connect",
          edge: {
            id: "start-review",
            source: { nodeId: "start", port: "next" },
            target: { nodeId: "review", port: "input" },
          },
        },
        {
          type: "connect",
          edge: {
            id: "review-done",
            source: { nodeId: "review", port: "success" },
            target: { nodeId: "done", port: "input" },
          },
        },
      ],
    });

    expect(revealSteps).toEqual([
      { pending: ["review", "done"], nodeCount: 3, edgeCount: 2, revision: 1 },
      { pending: ["done"], nodeCount: 3, edgeCount: 2, revision: 1 },
      { pending: [], nodeCount: 3, edgeCount: 2, revision: 1 },
    ]);
    expect(receipt).toMatchObject({ status: "completed", resultingRevision: 1 });
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().snapshots).toHaveLength(1);
    expect(store.getState().nodeReveal).toBeNull();
  });

  it("always exposes the complete committed graph if the reveal is interrupted", async () => {
    const store = createWorkflowStore();
    const abortError = new DOMException("Stopped", "AbortError");
    const tools = createToolHandlers(store, uiActions(), {
      waitForNodeReveal: async () => {
        throw abortError;
      },
    });

    await expect(tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "first", type: "action", label: "First" } },
        { type: "createNode", node: { id: "second", type: "action", label: "Second" } },
      ],
    })).rejects.toBe(abortError);

    expect(store.getState().workflow.nodes.map((node) => node.id)).toEqual(["first", "second"]);
    expect(store.getState().workflow.revision).toBe(1);
    expect(store.getState().history).toHaveLength(1);
    expect(store.getState().nodeReveal).toBeNull();
  });

  it("keeps a completed edit successful when only the visual pacing fails", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions(), {
      waitForNodeReveal: async () => {
        throw new Error("Animation unavailable");
      },
    });

    await expect(tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "first", type: "action", label: "First" } },
        { type: "createNode", node: { id: "second", type: "action", label: "Second" } },
      ],
    })).resolves.toMatchObject({ status: "completed" });

    expect(store.getState().workflow.nodes).toHaveLength(2);
    expect(store.getState().nodeReveal).toBeNull();
  });
});
