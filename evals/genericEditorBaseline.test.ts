import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";
import { createSurfaceEvalSession } from "./surfaceBridge";
import { genericEditorResult, genericEditorSnapshot } from "./genericEditorBaseline";

describe("generic editor eval baseline", () => {
  it("returns only the generic editor data needed to inspect and continue", () => {
    const store = createWorkflowStore();

    expect(genericEditorSnapshot(store.getState().workflow)).toEqual({
      revision: 0,
      items: [
        { id: "start", label: "Order received", x: 40, y: 180 },
        { id: "fetch-orders", label: "Fetch Orders", x: 280, y: 180 },
        { id: "save-results", label: "Save Results", x: 540, y: 100 },
        { id: "alert-team", label: "Alert Team", x: 540, y: 300 },
        { id: "complete", label: "Complete", x: 800, y: 180 },
      ],
      relationships: [
        { id: "edge-start-fetch", sourceId: "start", sourceTerminal: "next", targetId: "fetch-orders", targetTerminal: "input" },
        { id: "edge-fetch-save", sourceId: "fetch-orders", sourceTerminal: "success", targetId: "save-results", targetTerminal: "input" },
        { id: "edge-save-end", sourceId: "save-results", sourceTerminal: "success", targetId: "complete", targetTerminal: "input" },
      ],
    });
  });

  it("returns the minimal conventional result for a successful edit", () => {
    const store = createWorkflowStore();
    const result = store.getState().apply(0, [
      { type: "updateNode", id: "fetch-orders", patch: { label: "Fetch Orders v2" } },
    ]);

    expect(genericEditorResult(result)).toEqual({
      status: "completed",
      changed: [{ id: "fetch-orders", action: "updated" }],
    });
  });

  it("exposes the generic result through the eval bridge", async () => {
    const session = createSurfaceEvalSession();
    const tools = session.listTools();

    expect(tools.find((tool) => tool.name === "discover_workflow")?.outputSchemas.genericEditor)
      .toMatchObject({ title: "Generic editor snapshot" });
    expect(tools.find((tool) => tool.name === "edit_workflow")?.outputSchemas.genericEditor)
      .toMatchObject({ title: "Generic editor result" });

    const discovery = await session.execute("discover_workflow", {});
    expect(discovery.outputs.genericEditor).toMatchObject({
      revision: 0,
      items: expect.arrayContaining([
        { id: "start", label: "Order received", x: 40, y: 180 },
      ]),
      relationships: expect.arrayContaining([
        expect.objectContaining({ sourceId: "fetch-orders", sourceTerminal: "success", targetId: "save-results", targetTerminal: "input" }),
      ]),
    });

    const edit = await session.execute("edit_workflow", {
      baseRevision: 0,
      commands: [{ type: "updateNode", id: "fetch-orders", patch: { label: "Fetch Orders v2" } }],
    });
    expect(edit.outputs.genericEditor).toEqual({
      status: "completed",
      changed: [{ id: "fetch-orders", action: "updated" }],
    });
  });
});
