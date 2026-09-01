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
    workflow.nodes = workflow.nodes.filter((node) => node.id !== "patient-arrives" && node.id !== "follow-up-complete");
    workflow.edges = workflow.edges.filter((edge) => edge.source !== "patient-arrives" && edge.target !== "follow-up-complete");
    expect(validateWorkflow(workflow)).toMatchObject({ valid: true });
    expect(validateWorkflow(workflow).problems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MISSING_START" }),
      expect.objectContaining({ code: "MISSING_END" }),
    ]));
  });

  it("still reports a missing required branch on a connected condition", () => {
    const workflow = createSeedWorkflow();
    workflow.edges = workflow.edges.filter((edge) => edge.id !== "edge-arrival-emergency");
    expect(validateWorkflow(workflow).problems).toContainEqual(expect.objectContaining({
      code: "UNCONNECTED_REQUIRED_OUTPUT",
      message: "Scheduled arrival? has no no destination.",
    }));
  });

  it("treats missing endpoints and cycles as fatal", () => {
    const workflow = createSeedWorkflow();
    workflow.edges.push({ id: "bad", source: "follow-up-complete", sourcePort: "next", target: "missing", targetPort: "input" });
    expect(validateWorkflow(workflow)).toMatchObject({ valid: false, problems: expect.arrayContaining([expect.objectContaining({ code: "MISSING_EDGE_ENDPOINT", severity: "error" })]) });
  });
});
