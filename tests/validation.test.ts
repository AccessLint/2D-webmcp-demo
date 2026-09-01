import { describe, expect, it } from "vitest";
import { createSeedWorkflow } from "../src/graph/seedWorkflow";
import { validateWorkflow } from "../src/graph/validation";

describe("workflow validation", () => {
  it("treats nodes without incoming or outgoing connections as implicit boundaries", () => {
    const validation = validateWorkflow(createSeedWorkflow());
    expect(validation.valid).toBe(true);
    expect(validation.problems).toEqual([]);
  });

  it("infers entry and terminal nodes from connections", () => {
    const workflow = createSeedWorkflow();
    workflow.nodes = workflow.nodes.filter((node) => node.id !== "new-lead" && node.id !== "complete");
    workflow.edges = workflow.edges.filter((edge) => edge.source !== "new-lead" && edge.target !== "complete");
    expect(validateWorkflow(workflow)).toMatchObject({ valid: true });
    expect(validateWorkflow(workflow).problems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_START" }),
      expect.objectContaining({ code: "MISSING_END" }),
    ]));
  });

  it("still reports a missing required branch on a connected condition", () => {
    const workflow = createSeedWorkflow();
    workflow.edges = workflow.edges.filter((edge) => edge.id !== "edge-qualified-nurture");
    expect(validateWorkflow(workflow).problems).toContainEqual(expect.objectContaining({
      code: "UNCONNECTED_REQUIRED_OUTPUT",
      message: "Qualified lead? has no no destination.",
    }));
  });

  it("treats missing endpoints and cycles as fatal", () => {
    const workflow = createSeedWorkflow();
    workflow.edges.push({ id: "bad", source: "complete", sourcePort: "next", target: "missing", targetPort: "input" });
    expect(validateWorkflow(workflow)).toMatchObject({ valid: false, problems: expect.arrayContaining([expect.objectContaining({ code: "MISSING_EDGE_ENDPOINT", severity: "error" })]) });
  });
});
