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
      finish: { x: 1620, y: 100 },
      start: { x: 100, y: 100 },
      review: { x: 480, y: 100 },
      approve: { x: 860, y: 100 },
      archive: { x: 1240, y: 100 },
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
      decision: { x: 100, y: 220 },
      "a-rejected": { x: 480, y: 340 },
      "z-approved": { x: 480, y: 100 },
      finish: { x: 860, y: 220 },
    });
  });

  it("uses explicitly positioned neighbors as anchors without moving them", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);

    await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "request", type: "action", label: "Request", position: { x: 100, y: 220 } } },
        { type: "createNode", node: { id: "review", type: "action", label: "Review" } },
        { type: "createNode", node: { id: "complete", type: "end", label: "Complete", position: { x: 700, y: 220 } } },
        connect("request-review", "request", "success", "review"),
        connect("review-complete", "review", "success", "complete"),
      ],
    });

    const positions = Object.fromEntries(
      store.getState().workflow.nodes.map((node) => [node.id, node.position]),
    );
    expect(positions).toEqual({
      request: { x: 100, y: 220 },
      review: { x: 400, y: 220 },
      complete: { x: 700, y: 220 },
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
      fix: { x: 480, y: 100 },
      verify: { x: 860, y: 100 },
      release: { x: 1240, y: 100 },
    });
  });

  it("preserves a position explicitly assigned later in the same batch", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);

    await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "placed", type: "action", label: "Placed" } },
        { type: "updateNode", id: "placed", patch: { position: { x: 640, y: 360 } } },
      ],
    });

    expect(store.getState().workflow.nodes[0].position).toEqual({ x: 640, y: 360 });
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
    expect(positions.join).toEqual({ x: 480, y: 340 });
    expect(positions.continue.y).not.toBe(positions.join.y);
  });

  it("centers an automatic join between manually positioned predecessors", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);

    await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "top", type: "action", label: "Top", position: { x: 100, y: 100 } } },
        { type: "createNode", node: { id: "middle", type: "action", label: "Middle", position: { x: 100, y: 300 } } },
        { type: "createNode", node: { id: "bottom", type: "action", label: "Bottom", position: { x: 100, y: 900 } } },
        { type: "createNode", node: { id: "join", type: "action", label: "Join" } },
        connect("top-join", "top", "success", "join"),
        connect("middle-join", "middle", "success", "join"),
        connect("bottom-join", "bottom", "success", "join"),
      ],
    });

    const join = store.getState().workflow.nodes.find((node) => node.id === "join")!;
    expect(join.position.y).toBeCloseTo((100 + 300 + 900) / 3);
  });
});
