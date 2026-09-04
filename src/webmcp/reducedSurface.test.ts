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
  const store = createWorkflowStore();
  const registered = new Map<string, WebMCPTool>();
  const modelContext = Object.assign(new EventTarget(), {
    registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
  });
  Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
  const registration = registerWorkflowTools(createToolHandlers(store, uiActions));
  return { registered, registration, store };
}

describe("reduced WebMCP surface", () => {
  it("registers six task-oriented tools", async () => {
    const { registered, registration } = registerTools();
    await registration.ready;

    expect([...registered.keys()]).toEqual([
      "discover_workflow",
      "inspect_workflow_items",
      "create_workflow",
      "edit_workflow",
      "show_target",
      "undo_workflow_edit",
    ]);

    registration.unregister();
    delete document.modelContext;
  });

  it("creates a complete empty-canvas workflow through a compact contract", async () => {
    const { registered, registration, store } = registerTools();
    await registration.ready;
    const create = registered.get("create_workflow")!;
    const serializedSchema = JSON.stringify(create.inputSchema);
    expect(create.description).toContain("do not discover first solely to check emptiness");

    expect(serializedSchema.length).toBeLessThan(1_800);
    expect(serializedSchema).not.toContain('"baseRevision"');
    expect(serializedSchema).not.toContain('"position"');
    expect(serializedSchema).not.toContain('"nodeId"');
    expect(serializedSchema).not.toContain('"edgeId"');

    const receipt = await create.execute({
      nodes: [
        { key: "intake", type: "input", label: "Report intake" },
        { key: "triage", type: "action", label: "Triage report" },
        { key: "duplicate", type: "condition", label: "Duplicate?" },
        { key: "close", type: "end", label: "Close report" },
      ],
      connections: [
        { from: "intake", to: "triage" },
        { from: "triage", to: "duplicate" },
        { from: "duplicate", on: "yes", to: "close" },
        { from: "duplicate", on: "no", to: "close", label: "Not duplicate" },
      ],
    });

    expect(receipt).toMatchObject({
      status: "completed",
      resultingRevision: 1,
      atomic: true,
      verification: "native-diff",
    });
    expect(store.getState().workflow).toMatchObject({
      revision: 1,
      nodes: [
        expect.objectContaining({ id: "report-intake", type: "input", label: "Report intake" }),
        expect.objectContaining({ id: "triage-report", type: "action", label: "Triage report" }),
        expect.objectContaining({ id: "duplicate", type: "condition", label: "Duplicate?" }),
        expect.objectContaining({ id: "close-report", type: "end", label: "Close report" }),
      ],
      edges: [
        expect.objectContaining({ source: "report-intake", sourcePort: "data", target: "triage-report", targetPort: "input" }),
        expect.objectContaining({ source: "triage-report", sourcePort: "success", target: "duplicate", targetPort: "input" }),
        expect.objectContaining({ source: "duplicate", sourcePort: "yes", target: "close-report", targetPort: "input" }),
        expect.objectContaining({ source: "duplicate", sourcePort: "no", target: "close-report", targetPort: "input", label: "Not duplicate" }),
      ],
    });

    registration.unregister();
    delete document.modelContext;
  });

  it("rejects unsafe or invalid creation without changing the workflow", async () => {
    const { registered, registration, store } = registerTools();
    await registration.ready;
    const create = registered.get("create_workflow")!;

    const invalidReference = await create.execute({
      nodes: [{ key: "start", type: "start", label: "Start" }],
      connections: [{ from: "start", to: "missing" }],
    });
    expect(invalidReference).toMatchObject({
      ok: false,
      error: { code: "INVALID_CREATION", recovery: { tool: "create_workflow" } },
    });
    expect(store.getState().workflow).toMatchObject({ revision: 0, nodes: [], edges: [] });

    await create.execute({
      nodes: [{ key: "start", type: "start", label: "Start" }],
      connections: [],
    });
    const nonEmpty = await create.execute({
      nodes: [{ key: "replacement", type: "start", label: "Replacement" }],
      connections: [],
    });
    expect(nonEmpty).toMatchObject({
      ok: false,
      error: { code: "CANVAS_NOT_EMPTY", recovery: { tool: "discover_workflow" } },
    });
    expect(store.getState().workflow.nodes).toHaveLength(1);

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
    expect(description).toContain("do not call discover_workflow or inspect_workflow_items solely to verify it");

    const created = await edit.execute({
      commands: [{ type: "createNode", node: { id: "draft", type: "action", label: "Draft" } }],
    });
    expect(created).toMatchObject({
      status: "completed",
      resultingRevision: 1,
      atomic: true,
      verification: "native-diff",
    });

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
