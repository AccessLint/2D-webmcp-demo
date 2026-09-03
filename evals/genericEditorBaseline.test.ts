import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";
import { createSalesWorkflow } from "../tests/fixtures/salesWorkflow";
import { createSurfaceEvalSession } from "./surfaceBridge";
import { genericEditorResult, genericEditorSnapshot } from "./genericEditorBaseline";

describe("generic editor eval baseline", () => {
  it("returns only the generic editor data needed to inspect and continue", () => {
    const store = createWorkflowStore(createSalesWorkflow());

    expect(genericEditorSnapshot(store.getState().workflow)).toEqual({
      revision: 0,
      items: [
        { id: "new-lead", label: "New lead submitted", x: 40, y: 220 },
        { id: "enrich-company", label: "Enrich company", x: 280, y: 220 },
        { id: "qualified-lead", label: "Qualified lead?", x: 520, y: 220 },
        { id: "create-opportunity", label: "Create CRM opportunity", x: 760, y: 100 },
        { id: "add-to-nurture", label: "Add to nurture campaign", x: 760, y: 300 },
        { id: "manual-review", label: "Manual review", x: 760, y: 500 },
        { id: "complete", label: "Complete", x: 1020, y: 220 },
      ],
      relationships: [
        { id: "edge-lead-enrich", sourceId: "new-lead", sourceTerminal: "next", targetId: "enrich-company", targetTerminal: "input" },
        { id: "edge-enrich-qualified", sourceId: "enrich-company", sourceTerminal: "success", targetId: "qualified-lead", targetTerminal: "input" },
        { id: "edge-qualified-opportunity", sourceId: "qualified-lead", sourceTerminal: "yes", targetId: "create-opportunity", targetTerminal: "input" },
        { id: "edge-qualified-nurture", sourceId: "qualified-lead", sourceTerminal: "no", targetId: "add-to-nurture", targetTerminal: "input" },
        { id: "edge-opportunity-end", sourceId: "create-opportunity", sourceTerminal: "success", targetId: "complete", targetTerminal: "input" },
        { id: "edge-nurture-end", sourceId: "add-to-nurture", sourceTerminal: "success", targetId: "complete", targetTerminal: "input" },
      ],
    });
  });

  it("returns the minimal conventional result for a successful edit", () => {
    const store = createWorkflowStore(createSalesWorkflow());
    const result = store.getState().apply(0, [
      { type: "updateNode", id: "enrich-company", patch: { label: "Enrich company v2" } },
    ]);

    expect(genericEditorResult(result)).toEqual({
      status: "completed",
      changed: [{ id: "enrich-company", action: "updated" }],
    });
  });

  it("exposes the generic result through the eval bridge", async () => {
    const session = createSurfaceEvalSession(createSalesWorkflow());
    const tools = session.listTools();

    expect(tools.find((tool) => tool.name === "discover_workflow")?.outputSchemas.genericEditor)
      .toMatchObject({ title: "Generic editor snapshot" });
    expect(tools.find((tool) => tool.name === "edit_workflow")?.outputSchemas.genericEditor)
      .toMatchObject({ title: "Generic editor result" });

    const discovery = await session.execute("discover_workflow", {});
    expect(discovery.outputs.genericEditor).toMatchObject({
      revision: 0,
      items: expect.arrayContaining([
        { id: "new-lead", label: "New lead submitted", x: 40, y: 220 },
      ]),
      relationships: expect.arrayContaining([
        expect.objectContaining({ sourceId: "enrich-company", sourceTerminal: "success", targetId: "qualified-lead", targetTerminal: "input" }),
      ]),
    });

    const edit = await session.execute("edit_workflow", {
      baseRevision: 0,
      commands: [{ type: "updateNode", id: "enrich-company", patch: { label: "Enrich company v2" } }],
    });
    expect(edit.outputs.genericEditor).toEqual({
      status: "completed",
      changed: [{ id: "enrich-company", action: "updated" }],
    });
  });
});
