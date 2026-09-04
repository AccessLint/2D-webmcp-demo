import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../state/workflowStore";
import { registerWorkflowTools } from "./registerTools";
import { createToolHandlers } from "./toolHandlers";

const uiActions = {
  async focusChangeEntry(operationId: string) {
    return { operationId, focusedIn: "change-history" as const, visible: true as const };
  },
  async focusWorkflowNode() {
    return { focused: true as const, visible: true as const };
  },
  async focusDomNode(selector: string) {
    return {
      selector,
      tagName: "button",
      id: null,
      focusWhen: "window-focus-or-accessibility-interaction" as const,
      queued: true as const,
    };
  },
};

function registerTools() {
  const registered = new Map<string, WebMCPTool>();
  const modelContext = Object.assign(new EventTarget(), {
    registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
  });
  Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
  const registration = registerWorkflowTools(createToolHandlers(createWorkflowStore(), uiActions));
  return { registered, registration };
}

describe("reduced WebMCP surface", () => {
  it("registers five task-oriented tools", async () => {
    const { registered, registration } = registerTools();
    await registration.ready;

    expect([...registered.keys()]).toEqual([
      "discover_workflow",
      "inspect_workflow_items",
      "edit_workflow",
      "show_target",
      "undo_workflow_edit",
    ]);

    registration.unregister();
    delete document.modelContext;
  });

  it("publishes the smaller edit contract", async () => {
    const { registered, registration } = registerTools();
    await registration.ready;
    const edit = registered.get("edit_workflow")!;
    const serializedSchema = JSON.stringify(edit.inputSchema);
    const description = edit.description ?? "";

    expect(serializedSchema.length).toBeLessThan(2_800);
    expect(serializedSchema).not.toContain('"intent"');
    expect(serializedSchema).not.toContain('"position"');
    expect(serializedSchema).not.toContain('"replaceConnection"');
    expect(serializedSchema).not.toContain('"derived"');
    expect(description).toContain('{type:"createNode",node:{id:"node-id",type:"action",label:"Label"}}');
    expect(description).toContain('{type:"updateNode",id:"node-id",patch:{label:"New label"}}');
    expect(description).toContain('{type:"deleteNode",id:"node-id"}');
    expect(description).toContain('{type:"connect",edge:{id:"edge-id",source:{nodeId:"source-id",port:"success"},target:{nodeId:"target-id",port:"input"}}}');
    expect(description).toContain('{type:"disconnect",edgeId:"edge-id"}');

    const created = await edit.execute({
      commands: [{ type: "createNode", node: { id: "draft", type: "action", label: "Draft" } }],
    });
    expect(created).toMatchObject({ status: "completed", resultingRevision: 1 });

    registration.unregister();
    delete document.modelContext;
  });

  it("inspects receipts and shows every visible target through shared interfaces", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store, uiActions);
    const receipt = await tools.edit_workflow({
      commands: [{ type: "createNode", node: { id: "draft", type: "action", label: "Draft" } }],
    });

    expect(tools.inspect_workflow_items({
      objects: [{ kind: "change-receipt", id: receipt.operationId }],
      detail: "changes",
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationId: receipt.operationId, status: "completed" }),
    ]));
    await expect(tools.show_target({ kind: "workflow-node", id: "draft" }))
      .resolves.toMatchObject({ kind: "workflow-node", id: "draft", visible: true });
    await expect(tools.show_target({ kind: "change-receipt", id: receipt.operationId }))
      .resolves.toMatchObject({ operationId: receipt.operationId, visible: true });
    await expect(tools.show_target({ kind: "page-element", id: "canvas.zoom-in" }))
      .resolves.toMatchObject({ targetId: "canvas.zoom-in", queued: true });
  });
});
