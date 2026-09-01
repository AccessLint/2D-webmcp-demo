import { describe, expect, it } from "vitest";
import { executeBatch, type WorkflowCommand } from "../src/graph/commands";
import { createSeedWorkflow } from "../src/graph/seedWorkflow";

const actionCommands: WorkflowCommand[] = [
  { type: "createNode", node: { id: "notify-sales", type: "action", label: "Notify sales", position: { x: 900, y: 100 }, properties: {} } },
  { type: "disconnect", edgeId: "edge-opportunity-end" },
  { type: "connect", edge: { id: "edge-opportunity-notify", source: "create-opportunity", sourcePort: "success", target: "notify-sales", targetPort: "input" } },
  { type: "connect", edge: { id: "edge-notify-complete", source: "notify-sales", sourcePort: "success", target: "complete", targetPort: "input" } },
];

describe("workflow transactions", () => {
  it("atomically inserts an Action into an existing path", () => {
    const before = createSeedWorkflow();
    const result = executeBatch(before, { baseRevision: 0, commands: actionCommands });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.revision).toBe(1);
    expect(result.state.nodes.find((node) => node.id === "notify-sales")?.type).toBe("action");
    expect(result.state.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "create-opportunity", sourcePort: "success", target: "notify-sales" }),
      expect.objectContaining({ source: "notify-sales", sourcePort: "success", target: "complete" }),
    ]));
    expect(result.state.edges.some((edge) => edge.id === "edge-opportunity-end")).toBe(false);
  });

  it("rejects a stale or invalid batch without changing the supplied state", () => {
    const before = createSeedWorkflow();
    const stale = executeBatch(before, { baseRevision: 9, commands: actionCommands });
    const invalid = executeBatch(before, { baseRevision: 0, commands: [
      { type: "connect", edge: { id: "bad", source: "missing", sourcePort: "success", target: "complete", targetPort: "input" } },
    ] });

    expect(stale).toMatchObject({ ok: false, status: "conflict" });
    expect(invalid).toMatchObject({ ok: false, status: "failed" });
    expect(before).toEqual(createSeedWorkflow());
  });

  it("supports updates and deletions while keeping a mixed batch atomic", () => {
    const before = createSeedWorkflow();
    const updated = executeBatch(before, { baseRevision: 0, commands: [
      { type: "updateNode", id: "manual-review", patch: { label: "Review manually" } },
      { type: "deleteNode", id: "manual-review" },
      { type: "disconnect", edgeId: "missing-edge" },
    ] });
    expect(updated).toMatchObject({ ok: false, status: "failed" });
    expect(before.nodes.find((node) => node.id === "manual-review")?.label).toBe("Manual review");
  });
});
