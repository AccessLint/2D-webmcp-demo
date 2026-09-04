import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";
import { createToolHandlers } from "../src/webmcp/toolHandlers";

const uiActions = {
  async focusChangeEntry(operationId: string) {
    return { operationId, focusedIn: "change-history" as const, visible: true as const };
  },
  async focusWorkflowNode() {
    return { focused: true as const, visible: true as const };
  },
  async focusDomNode(selector: string) {
    return {
      selector,
      tagName: "button",
      id: null,
      focusWhen: "window-focus-or-accessibility-interaction" as const,
      queued: true as const,
    };
  },
};

const connect = (
  id: string,
  sourceNodeId: string,
  sourcePort: string,
  targetNodeId: string,
  targetPort = "input",
) => ({
  type: "connect" as const,
  edge: {
    id,
    source: { nodeId: sourceNodeId, port: sourcePort },
    target: { nodeId: targetNodeId, port: targetPort },
  },
});

describe("automatic workflow layout", () => {
  it("cleans up the whole graph when edit_workflow completes", async () => {
    const store = createWorkflowStore({
      revision: 0,
      nodes: [
        { id: "start", type: "start", label: "Start", position: { x: 40, y: 40 }, properties: {} },
        { id: "review", type: "action", label: "Review", position: { x: 40, y: 40 }, properties: {} },
        { id: "done", type: "end", label: "Done", position: { x: 40, y: 40 }, properties: {} },
      ],
      edges: [
        { id: "start-review", source: "start", sourcePort: "next", target: "review", targetPort: "input" },
        { id: "review-done", source: "review", sourcePort: "success", target: "done", targetPort: "input" },
      ],
    });
    const tools = createToolHandlers(store, uiActions);

    const receipt = await tools.edit_workflow({
      baseRevision: 0,
      commands: [{ type: "updateNode", id: "review", patch: { label: "Review request" } }],
    });

    expect(Object.fromEntries(
      store.getState().workflow.nodes.map((node) => [node.id, node.position]),
    )).toEqual({
      start: { x: 100, y: 100 },
      review: { x: 385, y: 100 },
      done: { x: 670, y: 100 },
    });
    expect(receipt.layout).toEqual({
      action: "auto-layout",
      affectedNodeIds: ["start", "review", "done"],
    });
  });

  it("lays out a position-free chain in flow order rather than command order", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);

    await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "finish", type: "end", label: "Finish" } },
        { type: "createNode", node: { id: "start", type: "start", label: "Start" } },
        { type: "createNode", node: { id: "review", type: "action", label: "Review" } },
        { type: "createNode", node: { id: "approve", type: "action", label: "Approve" } },
        { type: "createNode", node: { id: "archive", type: "action", label: "Archive" } },
        connect("start-review", "start", "next", "review"),
        connect("review-approve", "review", "success", "approve"),
        connect("approve-archive", "approve", "success", "archive"),
        connect("archive-finish", "archive", "success", "finish"),
      ],
    });

    const positions = Object.fromEntries(
      store.getState().workflow.nodes.map((node) => [node.id, node.position]),
    );
    expect(positions).toEqual({
      finish: { x: 1240, y: 100 },
      start: { x: 100, y: 100 },
      review: { x: 385, y: 100 },
      approve: { x: 670, y: 100 },
      archive: { x: 955, y: 100 },
    });
  });

  it("orders branches by their source ports and centers their join", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);

    await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "decision", type: "condition", label: "Approved?" } },
        { type: "createNode", node: { id: "a-rejected", type: "action", label: "Reject" } },
        { type: "createNode", node: { id: "z-approved", type: "action", label: "Approve" } },
        { type: "createNode", node: { id: "finish", type: "end", label: "Finish" } },
        connect("decision-yes", "decision", "yes", "z-approved"),
        connect("decision-no", "decision", "no", "a-rejected"),
        connect("approved-finish", "z-approved", "success", "finish"),
        connect("rejected-finish", "a-rejected", "success", "finish"),
      ],
    });

    const positions = Object.fromEntries(
      store.getState().workflow.nodes.map((node) => [node.id, node.position]),
    );
    expect(positions).toEqual({
      decision: { x: 100, y: 155.5 },
      "a-rejected": { x: 385, y: 211 },
      "z-approved": { x: 385, y: 100 },
      finish: { x: 670, y: 155.5 },
    });
  });

  it("keeps the forward path sequential when the workflow contains a back edge", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);

    await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "intake", type: "input", label: "Intake" } },
        { type: "createNode", node: { id: "fix", type: "action", label: "Fix" } },
        { type: "createNode", node: { id: "verify", type: "condition", label: "Verified?" } },
        { type: "createNode", node: { id: "release", type: "end", label: "Release" } },
        connect("intake-fix", "intake", "data", "fix"),
        connect("fix-verify", "fix", "success", "verify"),
        connect("verify-fix", "verify", "no", "fix"),
        connect("verify-release", "verify", "yes", "release"),
      ],
    });

    const positions = Object.fromEntries(
      store.getState().workflow.nodes.map((node) => [node.id, node.position]),
    );
    expect(positions).toEqual({
      intake: { x: 100, y: 100 },
      fix: { x: 385, y: 100 },
      verify: { x: 670, y: 100 },
      release: { x: 955, y: 100 },
    });
  });

  it("rejects positions because WebMCP layout is automatic", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);

    await expect(tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "placed", type: "action", label: "Placed", position: { x: 640, y: 360 } } },
      ],
    })).rejects.toThrow("Unrecognized key");

    expect(store.getState().workflow.nodes).toEqual([]);
  });

  it("centers a join between all of its incoming paths", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);

    await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "top", type: "action", label: "Top" } },
        { type: "createNode", node: { id: "middle", type: "action", label: "Middle" } },
        { type: "createNode", node: { id: "bottom", type: "action", label: "Bottom" } },
        { type: "createNode", node: { id: "join", type: "action", label: "Join" } },
        { type: "createNode", node: { id: "continue", type: "action", label: "Continue" } },
        connect("top-join", "top", "success", "join"),
        connect("bottom-join", "bottom", "success", "join"),
        connect("middle-continue", "middle", "success", "continue"),
      ],
    });

    const positions = Object.fromEntries(
      store.getState().workflow.nodes.map((node) => [node.id, node.position]),
    );
    expect(positions.join).toEqual({ x: 385, y: 211 });
    expect(positions.continue.y).not.toBe(positions.join.y);
  });

  it("stacks branches when connections are added after automatic node creation", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);

    await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "decision", type: "condition", label: "Approved?" } },
        { type: "createNode", node: { id: "approved", type: "action", label: "Approve" } },
        { type: "createNode", node: { id: "rejected", type: "action", label: "Reject" } },
      ],
    });
    await tools.edit_workflow({
      baseRevision: 1,
      commands: [
        connect("decision-yes", "decision", "yes", "approved"),
        connect("decision-no", "decision", "no", "rejected"),
      ],
    });

    const positions = Object.fromEntries(
      store.getState().workflow.nodes.map((node) => [node.id, node.position]),
    );
    expect(positions).toEqual({
      decision: { x: 100, y: 155.5 },
      approved: { x: 385, y: 100 },
      rejected: { x: 385, y: 211 },
    });
  });

  it("stacks a later branch whose target was already connected elsewhere", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);

    await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "start", type: "start", label: "Start" } },
        { type: "createNode", node: { id: "decision", type: "condition", label: "Approved?" } },
        { type: "createNode", node: { id: "approved", type: "action", label: "Approve" } },
        { type: "createNode", node: { id: "rejected", type: "action", label: "Reject" } },
        { type: "createNode", node: { id: "done", type: "end", label: "Done" } },
        connect("start-decision", "start", "next", "decision"),
        connect("decision-yes", "decision", "yes", "approved"),
        connect("rejected-done", "rejected", "success", "done"),
      ],
    });
    await tools.edit_workflow({
      baseRevision: 1,
      commands: [connect("decision-no", "decision", "no", "rejected")],
    });

    const positions = Object.fromEntries(
      store.getState().workflow.nodes.map((node) => [node.id, node.position]),
    );
    expect(positions.approved.x).toBe(positions.rejected.x);
    expect(positions.approved.y).not.toBe(positions.rejected.y);
  });
});
