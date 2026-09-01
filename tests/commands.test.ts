import { describe, expect, it } from "vitest";
import { executeBatch, type WorkflowCommand } from "../src/graph/commands";
import { createSeedWorkflow } from "../src/graph/seedWorkflow";

const actionCommands: WorkflowCommand[] = [
  { type: "createNode", node: { id: "notify-care-team", type: "action", label: "Notify care team", position: { x: 9400, y: 300 }, properties: {} } },
  { type: "disconnect", edgeId: "edge-follow-up-complete" },
  { type: "connect", edge: { id: "edge-follow-up-notify", source: "follow-up-attended", sourcePort: "yes", target: "notify-care-team", targetPort: "input" } },
  { type: "connect", edge: { id: "edge-notify-complete", source: "notify-care-team", sourcePort: "success", target: "follow-up-complete", targetPort: "input" } },
];

describe("workflow transactions", () => {
  it("atomically inserts an Action into an existing path", () => {
    const before = createSeedWorkflow();
    const result = executeBatch(before, { baseRevision: 0, commands: actionCommands });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.revision).toBe(1);
    expect(result.state.nodes.find((node) => node.id === "notify-care-team")?.type).toBe("action");
    expect(result.state.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "follow-up-attended", sourcePort: "yes", target: "notify-care-team" }),
      expect.objectContaining({ source: "notify-care-team", sourcePort: "success", target: "follow-up-complete" }),
    ]));
    expect(result.state.edges.some((edge) => edge.id === "edge-follow-up-complete")).toBe(false);
  });

  it("rejects a stale or invalid batch without changing the supplied state", () => {
    const before = createSeedWorkflow();
    const stale = executeBatch(before, { baseRevision: 9, commands: actionCommands });
    const invalid = executeBatch(before, { baseRevision: 0, commands: [
      { type: "connect", edge: { id: "bad", source: "missing", sourcePort: "success", target: "follow-up-complete", targetPort: "input" } },
    ] });

    expect(stale).toMatchObject({ ok: false, status: "conflict" });
    expect(invalid).toMatchObject({ ok: false, status: "failed" });
    expect(before).toEqual(createSeedWorkflow());
  });

  it("supports updates and deletions while keeping a mixed batch atomic", () => {
    const before = createSeedWorkflow();
    const updated = executeBatch(before, { baseRevision: 0, commands: [
      { type: "updateNode", id: "abnormal-review", patch: { label: "Review manually" } },
      { type: "deleteNode", id: "abnormal-review" },
      { type: "disconnect", edgeId: "missing-edge" },
    ] });
    expect(updated).toMatchObject({ ok: false, status: "failed" });
    expect(before.nodes.find((node) => node.id === "abnormal-review")?.label).toBe("Clinician reviews and escalates abnormal results");
  });
});
