import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";
import { registerWorkflowTools } from "../src/webmcp/registerTools";
import { createToolHandlers } from "../src/webmcp/toolHandlers";

describe("WebMCP tool boundary", () => {
  it("reads, edits, retrieves, focuses, reveals, and undoes through application state", async () => {
    const store = createWorkflowStore();
    let focusedOperationId: string | null = null;
    let focusedNodeId: string | null = null;
    let focusedSelector: string | null = null;
    const tools = createToolHandlers(store, {
      focusChangeEntry: async (operationId) => {
        focusedOperationId = operationId;
        return { operationId, focusedIn: "change-history", visible: true };
      },
      focusWorkflowNode: async (nodeId) => {
        focusedNodeId = nodeId;
        return { focused: true, visible: true };
      },
      focusDomNode: async (selector) => {
        focusedSelector = selector;
        return { selector, tagName: "div", id: null, focusWhen: "window-focus-or-accessibility-interaction", queued: true };
      },
    });
    const discovery = tools.discover_workflow({});
    expect(discovery).toMatchObject({
      schemaVersion: "1",
      revision: 0,
      nodes: 5,
      edges: 3,
      surfaceSchema: {
        id: "urn:2d-webmcp:schema:surface-snapshot:0.1",
        status: "draft",
        source: "2D-webmcp/schemas/surface-snapshot.v0.1.schema.json",
        version: "0.1",
      },
      surfaceSnapshot: {
        schemaVersion: "0.1",
        surface: {
          id: "workflow",
          documentVersion: "0",
          capabilities: {
            atomicity: "arbitrary-batch",
            revisionPreconditions: true,
            undo: "operation-token",
          },
        },
        items: expect.arrayContaining([
          expect.objectContaining({
            id: "fetch-orders",
            kind: "workflow-node",
            label: { value: "Fetch Orders", source: "author" },
            geometry: {
              type: "point",
              coordinateSpaceId: "world",
              origin: "top-left",
              x: 280,
              y: 180,
            },
          }),
        ]),
        relationships: expect.arrayContaining([
          expect.objectContaining({
            id: "edge-fetch-save",
            type: "connects",
            from: { itemId: "fetch-orders", terminal: "success" },
            to: { itemId: "save-results", terminal: "input" },
          }),
        ]),
      },
      authoring: {
        nodeTypes: expect.arrayContaining([
          { type: "retry", title: "Retry", inputs: ["input"], outputs: ["success", "failure"] },
        ]),
        nodes: expect.arrayContaining([
          { id: "fetch-orders", type: "action", label: "Fetch Orders", inputs: ["input"], outputs: ["success", "failure"] },
        ]),
        edges: expect.arrayContaining([
          { id: "edge-fetch-save", source: "fetch-orders", sourcePort: "success", target: "save-results", targetPort: "input" },
        ]),
        uiTargets: expect.arrayContaining([
          { id: "canvas.zoom-in", label: "Zoom In", selector: "button[aria-label='Zoom In']" },
        ]),
      },
      recommendedNextCalls: expect.arrayContaining([
        { tool: "inspect_workflow_items", input: { objects: [{ kind: "workflow-node", id: "fetch-orders" }] } },
        {
          tool: "edit_workflow",
          purpose: "Copy this valid call shape and replace the example command with the intended edit.",
          input: { baseRevision: 0, commands: [{ type: "updateNode", id: "fetch-orders", patch: { label: "Fetch Orders" } }] },
        },
      ]),
    });

    const receipt = tools.edit_workflow({
      baseRevision: 0,
      intent: "Add a Retry step after Fetch Orders",
      commands: [
        { type: "createNode", node: { id: "retry", type: "retry", label: "Retry", position: { x: 500, y: 200 }, properties: { attempts: 3 } } },
        { type: "replaceConnection", edgeId: "edge-fetch-save", replacement: [
          { id: "edge-fetch-retry", source: "fetch-orders", sourcePort: "success", target: "retry", targetPort: "input" },
          { id: "edge-retry-save", source: "retry", sourcePort: "success", target: "save-results", targetPort: "input" },
          { id: "edge-retry-alert", source: "retry", sourcePort: "failure", target: "alert-team", targetPort: "input" },
        ] },
      ],
    });
    expect(tools.get_edit_result({ operationId: receipt.operationId })).toEqual(receipt);
    await expect(tools.show_edit_result({ operationId: receipt.operationId })).resolves.toMatchObject({ operationId: receipt.operationId, summary: receipt.summary, focusedIn: "change-history", visible: true });
    expect(focusedOperationId).toBe(receipt.operationId);
    expect(tools.inspect_workflow_items({ objects: [{ kind: "workflow-node", id: "retry" }] })[0]).toMatchObject({ label: "Retry", properties: { attempts: 3 } });
    await expect(tools.focus_page_element({ selector: "[data-id='retry']" })).resolves.toMatchObject({ selector: "[data-id='retry']", tagName: "div", focusWhen: "window-focus-or-accessibility-interaction", queued: true });
    expect(focusedSelector).toBe("[data-id='retry']");
    await expect(tools.focus_page_element({ targetId: "canvas.zoom-in" })).resolves.toMatchObject({ targetId: "canvas.zoom-in", selector: "button[aria-label='Zoom In']", queued: true });
    expect(focusedSelector).toBe("button[aria-label='Zoom In']");
    await expect(tools.show_workflow_item({ kind: "workflow-node", id: "retry" })).resolves.toMatchObject({ id: "retry", label: "Retry", focused: true, visible: true });
    expect(focusedNodeId).toBe("retry");
    expect(store.getState().selected).toEqual({ kind: "node", id: "retry" });
    expect(tools.undo_workflow_edit({ operationId: receipt.operationId }).summary).toContain("Undid");
  });

  it("returns application evidence for a stale edit without changing the graph", () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store);
    const receipt = tools.edit_workflow({ baseRevision: 4, commands: [{ type: "deleteNode", id: "fetch-orders" }] });
    expect(receipt).toMatchObject({
      status: "conflict", baseRevision: 4, resultingRevision: 0, changes: [], undo: { available: false },
      failure: { code: "REVISION_CONFLICT", message: "Expected revision 0, received 4." },
      recovery: { tool: "discover_workflow", input: {}, currentRevision: 0, then: "edit_workflow" },
    });
    expect(store.getState().workflow.revision).toBe(0);
    expect(tools.get_edit_result({ operationId: receipt.operationId })).toEqual(receipt);
  });

  it("preserves a typed command failure and recovery guidance in the receipt", () => {
    const tools = createToolHandlers(createWorkflowStore());
    const receipt = tools.edit_workflow({
      baseRevision: 0,
      commands: [{ type: "updateNode", id: "missing", patch: { label: "Still missing" } }],
    });

    expect(receipt).toMatchObject({
      status: "failed",
      failure: { code: "NOT_FOUND", message: "Node missing does not exist." },
      recovery: { tool: "discover_workflow", input: {}, currentRevision: 0, then: "edit_workflow" },
    });
  });

  it("does not request focus for a missing change entry", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store);
    await expect(tools.show_edit_result({ operationId: "missing" })).rejects.toThrow("Receipt missing does not exist");
  });

  it("does not request DOM focus for an empty selector", async () => {
    const store = createWorkflowStore();
    let focusRequested = false;
    const tools = createToolHandlers(store, {
      focusChangeEntry: async (operationId) => ({ operationId, focusedIn: "change-history", visible: true }),
      focusWorkflowNode: async () => ({ focused: true, visible: true }),
      focusDomNode: async (selector) => {
        focusRequested = true;
        return { selector, tagName: "div", id: null, focusWhen: "window-focus-or-accessibility-interaction", queued: true };
      },
    });

    await expect(tools.focus_page_element({ selector: "" })).rejects.toThrow();
    expect(focusRequested).toBe(false);
  });

  it("publishes runtime schemas and returns structured recovery errors", async () => {
    const registered = new Map<string, WebMCPTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const registration = registerWorkflowTools(createToolHandlers(createWorkflowStore()));
    expect([...registered.keys()]).toEqual([
      "discover_workflow", "inspect_workflow_items", "edit_workflow", "show_workflow_item",
      "focus_page_element", "get_edit_result", "show_edit_result", "undo_workflow_edit",
    ]);
    expect(registered.get("discover_workflow")?.description).toContain("Call this first");
    expect(registered.get("focus_page_element")?.description).toContain("Prefer targetId");
    const schema = registered.get("focus_page_element")?.inputSchema;
    expect(schema).toMatchObject({
      anyOf: expect.arrayContaining([
        expect.objectContaining({ properties: { targetId: expect.objectContaining({ enum: ["canvas.zoom-in", "canvas.zoom-out", "canvas.fit-view"] }) }, required: ["targetId"], additionalProperties: false }),
        expect.objectContaining({ properties: { selector: expect.objectContaining({ type: "string", minLength: 1, maxLength: 500 }) }, required: ["selector"], additionalProperties: false }),
      ]),
    });
    expect(registered.get("discover_workflow")!.execute({ unexpected: true })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", issues: expect.arrayContaining([expect.objectContaining({ path: [] })]) },
    });
    expect(registered.get("edit_workflow")?.inputSchema).toMatchObject({
      properties: {
        baseRevision: expect.objectContaining({ description: "Copy the current revision from discover_workflow." }),
        commands: expect.objectContaining({ description: "Atomic workflow edits. Every command must match one documented command type." }),
      },
      additionalProperties: false,
    });
    const applied = registered.get("edit_workflow")!.execute({
      baseRevision: 0,
      commands: [{ type: "updateNode", id: "fetch-orders", patch: { label: "Fetch Orders" } }],
    });
    expect(applied).not.toBeInstanceOf(Promise);
    expect(applied).toMatchObject({ status: "completed", resultingRevision: 1, operationId: expect.any(String) });
    expect(registered.get("get_edit_result")!.execute({ operationId: "missing" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND", message: "Receipt missing does not exist." },
    });
    await expect(registered.get("focus_page_element")!.execute({ targetId: "canvas.missing" })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        issues: expect.arrayContaining([expect.objectContaining({ path: ["targetId"] })]),
        recovery: { tool: "discover_workflow", input: {}, reason: "Refresh valid IDs, ports, UI targets, and examples before retrying." },
      },
    });
    registration.unregister();
    delete document.modelContext;
  });
});
