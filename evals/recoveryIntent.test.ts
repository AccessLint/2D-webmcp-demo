import { describe, expect, it } from "vitest";
import { evaluateRecoveryIntent } from "./recoveryIntent";
import { createSalesWorkflow } from "../tests/fixtures/salesWorkflow";

function withRecoveryRoute(target = "manual-review") {
  const before = createSalesWorkflow();
  const after = structuredClone(before);
  after.revision = 1;
  after.edges.push({
    id: "generated-edge-id",
    source: "enrich-company",
    sourcePort: "failure",
    target,
    targetPort: "input",
  });
  return { before, after };
}

describe("recovery intent evaluator", () => {
  it("accepts equivalent recovery routes without prescribing IDs or labels", () => {
    const { before, after } = withRecoveryRoute();
    expect(evaluateRecoveryIntent(before, after, true)).toEqual({
      passed: true,
      checks: expect.objectContaining({ enrichmentFailureIsHandled: true }),
    });
  });

  it("accepts a newly created sales-operations action when it is the recovery destination", () => {
    const { before, after } = withRecoveryRoute("review-enrichment");
    after.nodes.push({
      id: "review-enrichment",
      type: "action",
      label: "Review enrichment failures",
      position: { x: 760, y: 560 },
      properties: { queue: "Sales operations" },
    });
    expect(evaluateRecoveryIntent(before, after, true).passed).toBe(true);
  });

  it("rejects lost happy paths, unrelated edits, and missing evidence", () => {
    const { before, after } = withRecoveryRoute();
    after.edges = after.edges.filter((edge) => edge.id !== "edge-qualified-opportunity");
    after.nodes.push({ id: "unrelated", type: "node", label: "Unrelated", position: { x: 0, y: 0 }, properties: {} });

    expect(evaluateRecoveryIntent(before, after, false)).toMatchObject({
      passed: false,
      checks: {
        existingConnectionsArePreserved: false,
        noUnrelatedNodesWereAdded: false,
        editEvidenceWasShown: false,
      },
    });
  });

  it("does not infer sales-operations ownership from a label alone", () => {
    const { before, after } = withRecoveryRoute("unowned-review");
    after.nodes.push({
      id: "unowned-review",
      type: "action",
      label: "Manual review",
      position: { x: 760, y: 560 },
      properties: {},
    });

    expect(evaluateRecoveryIntent(before, after, true).passed).toBe(false);
  });
});
