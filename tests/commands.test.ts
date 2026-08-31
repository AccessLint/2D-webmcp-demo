import { describe, expect, it } from "vitest";
import { executeBatch, type WorkflowCommand } from "../src/graph/commands";
import { createSeedWorkflow } from "../src/graph/seedWorkflow";

const retryCommands: WorkflowCommand[] = [
  { type: "createNode", node: { id: "retry", type: "retry", label: "Retry", position: { x: 530, y: 200 }, properties: { attempts: 3 } } },
  { type: "disconnect", edgeId: "edge-enrich-qualified" },
  { type: "connect", edge: { id: "edge-enrich-retry", source: "enrich-company", sourcePort: "success", target: "retry", targetPort: "input" } },
  { type: "connect", edge: { id: "edge-retry-qualified", source: "retry", sourcePort: "success", target: "qualified-lead", targetPort: "input" } },
  { type: "connect", edge: { id: "edge-retry-review", source: "retry", sourcePort: "failure", target: "manual-review", targetPort: "input" } },
];

describe("workflow transactions", () => {
  it("atomically inserts Retry with three attempts and both outcomes", () => {
    const before = createSeedWorkflow();
    const result = executeBatch(before, { baseRevision: 0, commands: retryCommands });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.revision).toBe(1);
    expect(result.state.nodes.find((node) => node.id === "retry")?.properties.attempts).toBe(3);
    expect(result.state.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "retry", sourcePort: "success", target: "qualified-lead" }),
      expect.objectContaining({ source: "retry", sourcePort: "failure", target: "manual-review" }),
    ]));
    expect(result.state.edges.some((edge) => edge.id === "edge-enrich-qualified")).toBe(false);
  });

  it("rejects a stale or invalid batch without changing the supplied state", () => {
    const before = createSeedWorkflow();
    const stale = executeBatch(before, { baseRevision: 9, commands: retryCommands });
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
