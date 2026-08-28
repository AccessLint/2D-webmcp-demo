import { describe, expect, it } from "vitest";
import { executeBatch, type WorkflowCommand } from "../src/graph/commands";
import { createSeedWorkflow } from "../src/graph/seedWorkflow";

const retryCommands: WorkflowCommand[] = [
  { type: "createNode", node: { id: "retry", type: "retry", label: "Retry", position: { x: 530, y: 200 }, properties: { attempts: 3 } } },
  { type: "disconnect", edgeId: "edge-fetch-save" },
  { type: "connect", edge: { id: "edge-fetch-retry", source: "fetch-orders", sourcePort: "success", target: "retry", targetPort: "input" } },
  { type: "connect", edge: { id: "edge-retry-save", source: "retry", sourcePort: "success", target: "save-results", targetPort: "input" } },
  { type: "connect", edge: { id: "edge-retry-alert", source: "retry", sourcePort: "failure", target: "alert-team", targetPort: "input" } },
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
      expect.objectContaining({ source: "retry", sourcePort: "success", target: "save-results" }),
      expect.objectContaining({ source: "retry", sourcePort: "failure", target: "alert-team" }),
    ]));
    expect(result.state.edges.some((edge) => edge.id === "edge-fetch-save")).toBe(false);
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
      { type: "updateNode", id: "alert-team", patch: { label: "Page Operations" } },
      { type: "deleteNode", id: "alert-team" },
      { type: "disconnect", edgeId: "missing-edge" },
    ] });
    expect(updated).toMatchObject({ ok: false, status: "failed" });
    expect(before.nodes.find((node) => node.id === "alert-team")?.label).toBe("Alert Team");
  });
});
