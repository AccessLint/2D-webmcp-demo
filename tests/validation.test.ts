import { describe, expect, it } from "vitest";
import { createSeedWorkflow } from "../src/graph/seedWorkflow";
import { validateWorkflow } from "../src/graph/validation";

describe("workflow validation", () => {
  it("reports the unreachable manual-review path as a warning with a stable reference", () => {
    const validation = validateWorkflow(createSeedWorkflow());
    expect(validation.valid).toBe(true);
    expect(validation.problems).toContainEqual(expect.objectContaining({
      code: "UNREACHABLE_NODE", severity: "warning", target: expect.objectContaining({ id: "manual-review", href: "#inspect-node-manual-review" }),
    }));
  });

  it("reports a Retry without a failure destination", () => {
    const workflow = createSeedWorkflow();
    workflow.nodes.push({ id: "retry", type: "retry", label: "Retry", position: { x: 0, y: 0 }, properties: { attempts: 3 } });
    workflow.edges.push({ id: "to-retry", source: "enrich-company", sourcePort: "success", target: "retry", targetPort: "input" });
    expect(validateWorkflow(workflow).problems).toContainEqual(expect.objectContaining({ code: "UNCONNECTED_FAILURE_PORT", message: "Retry has no failure destination." }));
  });

  it("treats missing endpoints and cycles as fatal", () => {
    const workflow = createSeedWorkflow();
    workflow.edges.push({ id: "bad", source: "complete", sourcePort: "next", target: "missing", targetPort: "input" });
    expect(validateWorkflow(workflow)).toMatchObject({ valid: false, problems: expect.arrayContaining([expect.objectContaining({ code: "MISSING_EDGE_ENDPOINT", severity: "error" })]) });
  });
});
