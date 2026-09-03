import { describe, expect, it } from "vitest";
import { createWorkflowStore } from "../src/state/workflowStore";
import { workflowSummary } from "../src/webmcp/discovery";
import { registerWorkflowTools } from "../src/webmcp/registerTools";
import { createToolHandlers } from "../src/webmcp/toolHandlers";
import { fitToolOutput } from "../src/webmcp/toolOutputs";
import { createSalesWorkflow } from "./fixtures/salesWorkflow";

const createSalesWorkflowStore = () => createWorkflowStore(createSalesWorkflow());

describe("WebMCP tool boundary", () => {
  it("omits workflow validation from compact discovery", () => {
    const workflow = createSalesWorkflow();
    workflow.edges = workflow.edges.filter((edge) => edge.id !== "edge-qualified-nurture");

    const compact = fitToolOutput(
      "discover_workflow",
      {},
      workflowSummary(workflow),
    ) as Record<string, unknown>;

    expect(compact).not.toHaveProperty("validation");
    expect(JSON.stringify(compact).length).toBeLessThanOrEqual(1_500);
  });

  it("reads, edits, retrieves, focuses, reveals, and undoes through application state", async () => {
    const store = createSalesWorkflowStore();
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
      schemaVersion: "2",
      revision: 0,
      nodes: 7,
      edges: 6,
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
            id: "enrich-company",
            kind: "workflow-node",
            label: { value: "Enrich company", source: "author" },
            geometry: {
              type: "point",
              coordinateSpaceId: "world",
              origin: "top-left",
              x: 280,
              y: 220,
            },
          }),
        ]),
        relationships: expect.arrayContaining([
          expect.objectContaining({
            id: "edge-enrich-qualified",
            type: "connects",
            from: { itemId: "enrich-company", terminal: "success" },
            to: { itemId: "qualified-lead", terminal: "input" },
          }),
        ]),
      },
      authoring: {
        nodeTypes: expect.arrayContaining([
          { type: "node", title: "Node", inputs: ["input"], outputs: ["next"] },
          { type: "action", title: "Action", inputs: ["input"], outputs: ["success", "failure"] },
          { type: "condition", title: "Condition", inputs: ["input"], outputs: ["yes", "no"] },
        ]),
        nodes: expect.arrayContaining([
          { id: "enrich-company", type: "action", label: "Enrich company", inputs: ["input"], outputs: ["success", "failure"] },
        ]),
        edges: expect.arrayContaining([
          { id: "edge-enrich-qualified", source: { nodeId: "enrich-company", port: "success" }, target: { nodeId: "qualified-lead", port: "input" } },
        ]),
        uiTargets: expect.arrayContaining([
          { id: "canvas.zoom-in", label: "Zoom In", selector: "button[aria-label='Zoom In']" },
        ]),
      },
      recommendedNextCalls: expect.arrayContaining([
        { tool: "inspect_workflow_items", input: { objects: [{ kind: "workflow-node", id: "enrich-company" }] } },
        {
          tool: "edit_workflow",
          purpose: "Copy this valid call shape and replace the example command with the intended edit.",
          input: { baseRevision: 0, commands: [{ type: "updateNode", id: "enrich-company", patch: { label: "Enrich company" } }] },
        },
      ]),
    });

    const receipt = await tools.edit_workflow({
      baseRevision: 0,
      intent: "Add Notify sales after Create CRM opportunity",
      commands: [
        { type: "createNode", node: { id: "notify-sales", type: "action", label: "Notify sales", position: { x: 900, y: 100 }, properties: {} } },
        { type: "replaceConnection", edgeId: "edge-opportunity-end", replacements: [
          { id: "edge-opportunity-notify", source: { nodeId: "create-opportunity", port: "success" }, target: { nodeId: "notify-sales", port: "input" } },
          { id: "edge-notify-complete", source: { nodeId: "notify-sales", port: "success" }, target: { nodeId: "complete", port: "input" } },
        ] },
      ],
    });
    expect(tools.get_edit_result({ operationId: receipt.operationId })).toMatchObject({
      operationId: receipt.operationId,
      summary: receipt.summary,
      status: receipt.status,
    });
    await expect(tools.show_edit_result({ operationId: receipt.operationId })).resolves.toMatchObject({ operationId: receipt.operationId, summary: receipt.summary, focusedIn: "change-history", visible: true });
    expect(focusedOperationId).toBe(receipt.operationId);
    expect(tools.inspect_workflow_items({ objects: [{ kind: "workflow-node", id: "notify-sales" }] })[0]).toMatchObject({ label: "Notify sales", properties: {} });
    const inspectedEdge = tools.inspect_workflow_items({ objects: [{ kind: "workflow-edge", id: "edge-opportunity-notify" }] })[0];
    expect(inspectedEdge).toMatchObject({
      id: "edge-opportunity-notify",
      source: { nodeId: "create-opportunity", port: "success" },
      target: { nodeId: "notify-sales", port: "input" },
    });
    expect(inspectedEdge).not.toHaveProperty("sourcePort");
    await expect(tools.focus_page_element({ selector: "[data-id='notify-sales']" })).resolves.toMatchObject({ selector: "[data-id='notify-sales']", tagName: "div", focusWhen: "window-focus-or-accessibility-interaction", queued: true });
    expect(focusedSelector).toBe("[data-id='notify-sales']");
    await expect(tools.focus_page_element({ targetId: "canvas.zoom-in" })).resolves.toMatchObject({ targetId: "canvas.zoom-in", selector: "button[aria-label='Zoom In']", queued: true });
    expect(focusedSelector).toBe("button[aria-label='Zoom In']");
    await expect(tools.show_workflow_item({ kind: "workflow-node", id: "notify-sales" })).resolves.toMatchObject({ id: "notify-sales", label: "Notify sales", focused: true, visible: true });
    expect(focusedNodeId).toBe("notify-sales");
    expect(store.getState().selected).toEqual({ kind: "node", id: "notify-sales" });
    expect(tools.undo_workflow_edit({ operationId: receipt.operationId }).summary).toContain("Undid");
  });

  it("returns application evidence for a stale edit without changing the graph", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store);
    const receipt = await tools.edit_workflow({ baseRevision: 4, commands: [{ type: "deleteNode", id: "enrich-company" }] });
    expect(receipt).toMatchObject({
      status: "conflict", baseRevision: 4, resultingRevision: 0, changes: [], undo: { available: false },
      failure: { code: "REVISION_CONFLICT", message: "Expected revision 0, received 4." },
      recovery: { tool: "discover_workflow", input: {}, currentRevision: 0, then: "edit_workflow" },
    });
    expect(store.getState().workflow.revision).toBe(0);
    expect(tools.get_edit_result({ operationId: receipt.operationId })).toMatchObject({
      operationId: receipt.operationId,
      status: receipt.status,
    });
  });

  it("accepts a discovered SurfaceSnapshot label when editing a node", async () => {
    const store = createSalesWorkflowStore();
    const tools = createToolHandlers(store);

    const receipt = await tools.edit_workflow({
      baseRevision: 0,
      commands: [{
        type: "updateNode",
        id: "enrich-company",
        patch: { label: { value: "Enrich company v2", source: "author" } },
      }],
    });

    expect(receipt).toMatchObject({ status: "completed", resultingRevision: 1 });
    expect(store.getState().workflow.nodes.find((node) => node.id === "enrich-company")?.label).toBe("Enrich company v2");
  });

  it("defaults omitted properties when creating a node", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store);

    const receipt = await tools.edit_workflow({
      baseRevision: 0,
      commands: [{
        type: "createNode",
        node: { id: "new-action", type: "action", label: "New action", position: { x: 700, y: 300 } },
      }],
    });

    expect(receipt).toMatchObject({ status: "completed", resultingRevision: 1 });
    expect(store.getState().workflow.nodes.find((node) => node.id === "new-action")?.properties).toEqual({});
  });

  it("normalizes the canonical nested edge contract at the WebMCP boundary", async () => {
    const store = createWorkflowStore();
    const tools = createToolHandlers(store);

    const created = await tools.edit_workflow({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "first", type: "action", label: "First" } },
        { type: "createNode", node: { id: "second", type: "action", label: "Second" } },
        {
          type: "connect",
          edge: {
            id: "first-second",
            source: { nodeId: "first", port: "success" },
            target: { nodeId: "second", port: "input" },
          },
        },
      ],
    });
    expect(created).toMatchObject({ status: "completed", changes: expect.any(Array) });
    expect(created.changes).toHaveLength(3);
    expect(store.getState().workflow.edges).toEqual([{
      id: "first-second",
      source: "first",
      sourcePort: "success",
      target: "second",
      targetPort: "input",
    }]);

    const replaced = await tools.edit_workflow({
      baseRevision: 1,
      commands: [{
        type: "replaceConnection",
        edgeId: "first-second",
        replacements: [{
          id: "second-first",
          source: { nodeId: "second", port: "success" },
          target: { nodeId: "first", port: "input" },
        }],
      }],
    });
    expect(replaced).toMatchObject({ status: "completed", changes: expect.any(Array) });
    expect(replaced.changes).toHaveLength(2);
    expect(store.getState().workflow.edges).toEqual([{
      id: "second-first",
      source: "second",
      sourcePort: "success",
      target: "first",
      targetPort: "input",
    }]);

    await expect(tools.edit_workflow({
      baseRevision: 2,
      commands: [{
        type: "connect",
        edge: { id: "flat-edge", source: "first", sourcePort: "success", target: "second", targetPort: "input" },
      }],
    })).rejects.toThrow();
    await expect(tools.edit_workflow({
      baseRevision: 2,
      commands: [{
        type: "replaceConnection",
        edgeId: "second-first",
        replacement: [{
          id: "singular-field",
          source: { nodeId: "first", port: "success" },
          target: { nodeId: "second", port: "input" },
        }],
      }],
    })).rejects.toThrow();
  });

  it("preserves a typed command failure and recovery guidance in the receipt", async () => {
    const tools = createToolHandlers(createWorkflowStore());
    const receipt = await tools.edit_workflow({
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
    const store = createSalesWorkflowStore();
    const observedInvocations: unknown[] = [];
    const observeInvocation = (event: Event) => observedInvocations.push((event as CustomEvent).detail);
    window.addEventListener("webmcp:invocation", observeInvocation);
    const registered = new Map<string, WebMCPTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const registration = registerWorkflowTools(createToolHandlers(store));
    await expect(registration.ready).resolves.toBe(true);
    expect([...registered.keys()]).toEqual([
      "discover_workflow", "inspect_workflow_items", "edit_workflow", "show_workflow_item",
      "focus_page_element", "get_edit_result", "show_edit_result", "undo_workflow_edit",
    ]);
    expect(registered.get("discover_workflow")?.description).toContain("Call this first");
    expect(registered.get("discover_workflow")?.description).toContain("do not call this tool again");
    expect(registered.get("discover_workflow")?.description).toContain("recovery directs");
    expect(registered.get("inspect_workflow_items")?.description).toContain("does not select or reveal");
    expect(registered.get("edit_workflow")?.description).toContain("Do not increment it");
    expect(registered.get("edit_workflow")?.description).toContain("Every command object needs a top-level type");
    expect(registered.get("edit_workflow")?.description).toContain('{type:"createNode",node:{...}}');
    expect(registered.get("edit_workflow")?.description).toContain("Never wrap a command");
    expect(registered.get("edit_workflow")?.description).toContain('source:{nodeId:"source-id",port:"success"}');
    expect(registered.get("edit_workflow")?.description).toContain("replacements:[{");
    expect(registered.get("edit_workflow")?.description).toContain("When visible is true, stop");
    expect(registered.get("edit_workflow")?.description).toContain("itemPage.nextCursor");
    expect(registered.get("edit_workflow")?.description).toContain("reveals the resulting receipt");
    expect(registered.get("focus_page_element")?.description).toContain("exactly one targetId");
    expect(registered.get("focus_page_element")?.description).toContain("Always call discover_workflow first");
    expect(registered.get("focus_page_element")?.description).toContain("Queue keyboard focus");
    expect(registered.get("focus_page_element")?.description).toContain("window receives focus");
    expect(registered.get("show_workflow_item")?.description).toContain("select, show, reveal, or bring an item into view");
    expect(registered.get("show_edit_result")?.description).toContain("visible false");
    expect(registered.get("show_edit_result")?.description).toContain("Do not call it after an edit that returns visible true");
    expect(registered.get("discover_workflow")?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    expect(registered.get("edit_workflow")?.annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: true,
    });
    expect(registered.get("focus_page_element")?.annotations).toEqual({ readOnlyHint: false });
    const schema = registered.get("focus_page_element")?.inputSchema;
    expect(schema).toMatchObject({
      type: "object",
      properties: {
        targetId: expect.objectContaining({ enum: ["canvas.zoom-in", "canvas.zoom-out", "canvas.fit-view"] }),
      },
      required: ["targetId"],
      additionalProperties: false,
    });
    const invalidDiscovery = registered.get("discover_workflow")!.execute({ unexpected: true });
    expect(invalidDiscovery).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        issues: expect.arrayContaining([expect.objectContaining({ path: [] })]),
        recovery: { tool: "discover_workflow", reason: expect.stringContaining("Correct") },
      },
    });
    expect(store.getState().invocations[0]).toMatchObject({
      tool: "discover_workflow",
      outcome: "failed",
      code: "INVALID_INPUT",
      parameterNames: [],
      unknownParameterCount: 1,
      durationMs: expect.any(Number),
    });
    expect(observedInvocations[0]).toMatchObject({ tool: "discover_workflow", code: "INVALID_INPUT" });
    const invalidEdit = await registered.get("edit_workflow")!.execute({
      baseRevision: 0,
      commands: [{ command: "createNode", node: {} }],
    });
    expect(invalidEdit).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: ["commands", 0, "type"],
            message: expect.stringContaining("createNode"),
          }),
        ]),
        recovery: {
          tool: "edit_workflow",
          reason: expect.stringContaining("top-level type"),
          commandExamples: {
            createNode: expect.objectContaining({ type: "createNode", node: expect.any(Object) }),
            connect: expect.objectContaining({ type: "connect", edge: expect.any(Object) }),
            replaceConnection: expect.objectContaining({
              type: "replaceConnection",
              edgeId: expect.any(String),
              replacements: expect.any(Array),
            }),
          },
        },
      },
    });
    expect(JSON.stringify(invalidEdit).length).toBeLessThanOrEqual(1_500);
    expect(registered.get("edit_workflow")?.inputSchema).toMatchObject({
      properties: {
        baseRevision: expect.objectContaining({ type: "integer", minimum: 0 }),
        commands: expect.objectContaining({ type: "array", minItems: 1, maxItems: 20 }),
      },
      additionalProperties: false,
    });
    expect(JSON.stringify(registered.get("edit_workflow")?.inputSchema).length).toBeLessThan(4_500);
    expect(JSON.stringify(registered.get("edit_workflow")?.inputSchema)).toContain('"nodeId"');
    expect(JSON.stringify(registered.get("edit_workflow")?.inputSchema)).not.toContain("\\\\p{");
    const applied = await registered.get("edit_workflow")!.execute({
      baseRevision: 0,
      commands: [{ type: "updateNode", id: "enrich-company", patch: { label: "Enrich company" } }],
    });
    expect(applied).toMatchObject({
      status: "completed",
      resultingRevision: 1,
      operationId: expect.any(String),
      changeCount: 0,
      changePage: { cursor: 0, nextCursor: null, items: [] },
      visible: false,
      nextCall: { tool: "show_edit_result", input: { operationId: expect.any(String) } },
    });
    expect(store.getState().invocations.find((invocation) => invocation.tool === "edit_workflow")).toMatchObject({
      outcome: "completed",
      baseRevision: 0,
      resultingRevision: 1,
      operationId: expect.any(String),
    });
    expect(JSON.stringify(applied).length).toBeLessThanOrEqual(1_500);
    const compactDiscovery = registered.get("discover_workflow")!.execute({}) as {
      itemPage: { items: unknown[]; nextCursor: number | null };
    };
    expect(compactDiscovery).toMatchObject({
      revision: 1,
      nodeTypes: expect.arrayContaining([
        { type: "start", inputs: [], outputs: ["next"] },
        { type: "end", inputs: ["input"], outputs: [] },
        { type: "parallel-gateway", inputs: ["input"], outputs: ["next"] },
      ]),
      itemPage: {
        cursor: 0,
        items: expect.arrayContaining([
          expect.objectContaining({ id: "enrich-company", label: "Enrich company" }),
        ]),
      },
      nextCalls: {
        edit: expect.stringMatching(/Reuse itemPage IDs.*positions are optional.*reveals its receipt/),
      },
    });
    expect(compactDiscovery.itemPage.items.length).toBeGreaterThanOrEqual(3);
    expect(compactDiscovery.itemPage.nextCursor).toBe(compactDiscovery.itemPage.items.length);
    expect(JSON.stringify(compactDiscovery).length).toBeLessThanOrEqual(1_500);
    const discoveryPage = registered.get("discover_workflow")!.execute({ limit: 1 });
    expect(discoveryPage).toMatchObject({
      itemPage: { cursor: 0, nextCursor: 1, items: [expect.any(Object)] },
    });
    const compactInspection = registered.get("inspect_workflow_items")!.execute({
      objects: [{ kind: "workflow-node", id: "enrich-company" }],
      detail: "summary",
    });
    expect(compactInspection).toMatchObject({
      requestedCount: 1,
      returnedCount: 1,
      items: [expect.objectContaining({ id: "enrich-company" })],
    });
    expect(Array.isArray(compactInspection)).toBe(false);
    const compactEdgeInspection = registered.get("inspect_workflow_items")!.execute({
      objects: [{ kind: "workflow-edge", id: "edge-enrich-qualified" }],
    });
    expect(compactEdgeInspection).toMatchObject({
      items: [expect.objectContaining({
        id: "edge-enrich-qualified",
        source: { nodeId: "enrich-company", port: "success" },
        target: { nodeId: "qualified-lead", port: "input" },
      })],
    });
    expect(registered.get("get_edit_result")!.execute({ operationId: "missing" })).toMatchObject({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Receipt missing does not exist.",
        recovery: { tool: "get_edit_result", reason: expect.stringContaining("operationId") },
      },
    });
    await expect(registered.get("focus_page_element")!.execute({ targetId: "canvas.missing" })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        issues: expect.arrayContaining([expect.objectContaining({ path: ["targetId"] })]),
        recovery: { tool: "focus_page_element", reason: expect.stringContaining("Correct") },
      },
    });
    window.removeEventListener("webmcp:invocation", observeInvocation);
    registration.unregister();
    delete document.modelContext;
  });

  it("rejects oversized domain strings before they enter workflow state", async () => {
    const registered = new Map<string, WebMCPTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const registration = registerWorkflowTools(createToolHandlers(createWorkflowStore()));

    const result = await registered.get("edit_workflow")!.execute({
      baseRevision: 0,
      commands: [{
        type: "createNode",
        node: {
          id: "x".repeat(65),
          type: "action",
          label: "Valid label",
          position: { x: 0, y: 0 },
          properties: {},
        },
      }],
    });

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

    const tooManyProperties = await registered.get("edit_workflow")!.execute({
      baseRevision: 0,
      commands: [{
        type: "createNode",
        node: {
          id: "bounded-properties",
          type: "action",
          label: "Bounded properties",
          position: { x: 0, y: 0 },
          properties: { one: 1, two: 2, three: 3, four: 4, five: 5 },
        },
      }],
    });
    expect(tooManyProperties).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

    const controlCharacters = await registered.get("edit_workflow")!.execute({
      baseRevision: 0,
      commands: [{
        type: "createNode",
        node: {
          id: "control-character",
          type: "action",
          label: `Unsafe\u0000label`,
          position: { x: 0, y: 0 },
          properties: {},
        },
      }],
    });
    expect(controlCharacters).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

    const manyInvalidCommands = await registered.get("edit_workflow")!.execute({
      baseRevision: 0,
      commands: Array.from({ length: 20 }, (_, index) => ({
        type: "deleteNode",
        id: `${String(index)}-${"x".repeat(65)}`,
      })),
    });
    expect(manyInvalidCommands).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        issueCount: 20,
        issuesTruncated: true,
      },
    });
    expect(JSON.stringify(manyInvalidCommands).length).toBeLessThanOrEqual(1_500);
    const manyWrappedCommands = await registered.get("edit_workflow")!.execute({
      baseRevision: 0,
      commands: Array.from({ length: 20 }, (_, index) => ({
        createNode: {
          node: { id: `wrapped-${String(index)}`, type: "action", label: `Wrapped ${String(index)}` },
        },
      })),
    });
    expect(manyWrappedCommands).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        issueCount: 20,
        issues: expect.arrayContaining([expect.objectContaining({
          path: ["commands", 0, "type"],
          message: expect.stringContaining("command's type field"),
        })]),
        issuesTruncated: true,
        recovery: {
          tool: "edit_workflow",
          reason: expect.stringContaining("top-level type"),
          commandExamples: {
            createNode: expect.objectContaining({ type: "createNode" }),
          },
        },
      },
    });
    expect(JSON.stringify(manyWrappedCommands).length).toBeLessThanOrEqual(1_500);
    const oversizedError = registered.get("discover_workflow")!.execute({ ["x".repeat(2_000)]: true });
    expect(oversizedError).toMatchObject({ ok: false, error: { code: "OUTPUT_TOO_LARGE" } });
    expect(JSON.stringify(oversizedError).length).toBeLessThanOrEqual(1_500);
    registration.unregister();
    delete document.modelContext;
  });

  it("compacts oversized inspection results without dropping the requested item", () => {
    const store = createSalesWorkflowStore();
    store.getState().apply(0, [{
      type: "updateNode",
      id: "enrich-company",
      patch: {
        label: "F".repeat(120),
        properties: {
          first: "a".repeat(120),
          second: "b".repeat(120),
          third: "c".repeat(120),
          fourth: "d".repeat(120),
        },
      },
    }]);
    const registered = new Map<string, WebMCPTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const registration = registerWorkflowTools(createToolHandlers(store));

    const result = registered.get("inspect_workflow_items")!.execute({
      objects: [{ kind: "workflow-node", id: "enrich-company" }],
      detail: "properties",
    });

    expect(result).toMatchObject({
      items: [expect.objectContaining({ kind: "workflow-node", id: "enrich-company", relationshipCount: 2 })],
      requestedCount: 1,
      returnedCount: 1,
    });
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500);
    const relationshipPage = registered.get("inspect_workflow_items")!.execute({
      objects: [{ kind: "workflow-node", id: "enrich-company" }],
      detail: "relationships",
      cursor: 1,
      limit: 1,
    });
    expect(relationshipPage).toMatchObject({
      items: [expect.objectContaining({
        relationshipPage: { cursor: 1, nextCursor: null, items: [expect.any(Object)] },
      })],
    });
    registration.unregister();
    delete document.modelContext;
  });

  it("pages compact receipt changes without validation metadata", async () => {
    const store = createSalesWorkflowStore();
    const registered = new Map<string, WebMCPTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const registration = registerWorkflowTools(createToolHandlers(store));

    const edit = await registered.get("edit_workflow")!.execute({
      baseRevision: 0,
      commands: Array.from({ length: 6 }, (_, index) => [{
          type: "createNode",
          node: {
            id: `isolated-${String(index)}`,
            type: "condition",
            label: `Isolated ${String(index)}`,
            position: { x: index * 20, y: 500 },
            properties: {},
          },
        }, {
          type: "connect",
          edge: {
            id: `edge-isolated-${String(index)}-complete`,
            source: { nodeId: `isolated-${String(index)}`, port: "yes" },
            target: { nodeId: "complete", port: "input" },
          },
        }]).flat(),
    }) as { operationId: string; changePage: { nextCursor: number | null } };

    expect(edit.changePage.nextCursor).toBe(3);
    expect(edit).not.toHaveProperty("validation");
    const nextPage = registered.get("get_edit_result")!.execute({
      operationId: edit.operationId,
      changeCursor: 3,
      changeLimit: 5,
    });
    expect(nextPage).toMatchObject({
      changePage: { cursor: 3, nextCursor: 8, items: expect.arrayContaining([expect.objectContaining({ id: "isolated-5" })]) },
    });
    expect(nextPage).not.toHaveProperty("validation");
    expect(JSON.stringify(nextPage).length).toBeLessThanOrEqual(1_500);
    registration.unregister();
    delete document.modelContext;
  });

  it("returns a completed compact receipt for a maximum-size valid edit", async () => {
    const registered = new Map<string, WebMCPTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const registration = registerWorkflowTools(createToolHandlers(createWorkflowStore(), {
      focusChangeEntry: async (operationId) => ({ operationId, focusedIn: "change-history", visible: true }),
      focusWorkflowNode: async () => ({ focused: true, visible: true }),
      focusDomNode: async (selector) => ({ selector, tagName: "div", id: null, focusWhen: "window-focus-or-accessibility-interaction", queued: true }),
    }));

    const result = await registered.get("edit_workflow")!.execute({
      baseRevision: 0,
      commands: Array.from({ length: 20 }, (_, index) => ({
        type: "createNode",
        node: { id: `node-${String(index)}`, type: "action", label: `Node ${String(index)}` },
      })),
    });

    expect(result).toMatchObject({
      status: "completed",
      baseRevision: 0,
      resultingRevision: 1,
      changeCount: 20,
      visible: true,
      changePage: { cursor: 0, nextCursor: expect.any(Number), items: expect.any(Array) },
    });
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500);
    registration.unregister();
    delete document.modelContext;
  });

  it("rolls back registration when any tool fails to register", async () => {
    let registrationSignal: AbortSignal | undefined;
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool, options?: { signal?: AbortSignal }) {
        registrationSignal = options?.signal;
        return tool.name === "edit_workflow"
          ? Promise.reject(new Error("registration denied"))
          : Promise.resolve();
      },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });

    const registration = registerWorkflowTools(createToolHandlers(createWorkflowStore()));

    await expect(registration.ready).rejects.toThrow("WebMCP tool registration failed");
    expect(registrationSignal?.aborted).toBe(true);
    registration.unregister();
    delete document.modelContext;
  });

  it("honors an invocation abort before starting an asynchronous UI action", async () => {
    let focusRequested = false;
    const registered = new Map<string, WebMCPTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const registration = registerWorkflowTools(createToolHandlers(createWorkflowStore(), {
      focusChangeEntry: async (operationId) => ({ operationId, focusedIn: "change-history", visible: true }),
      focusWorkflowNode: async () => ({ focused: true, visible: true }),
      focusDomNode: async (selector) => {
        focusRequested = true;
        return { selector, tagName: "button", id: null, focusWhen: "window-focus-or-accessibility-interaction", queued: true };
      },
    }));
    const controller = new AbortController();
    controller.abort();

    await expect(registered.get("focus_page_element")!.execute(
      { targetId: "canvas.zoom-in" },
      { signal: controller.signal },
    )).rejects.toHaveProperty("name", "AbortError");
    expect(focusRequested).toBe(false);
    registration.unregister();
    delete document.modelContext;
  });

  it("treats a custom abort reason as cancellation", async () => {
    const store = createWorkflowStore();
    const registered = new Map<string, WebMCPTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const registration = registerWorkflowTools(createToolHandlers(store));
    const controller = new AbortController();
    controller.abort("cancelled");

    await expect(registered.get("focus_page_element")!.execute(
      { targetId: "canvas.zoom-in" },
      { signal: controller.signal },
    )).rejects.toBe("cancelled");
    expect(store.getState().invocations[0]).toMatchObject({ outcome: "aborted", code: "ABORTED" });
    registration.unregister();
    delete document.modelContext;
  });

  it("reports a non-retryable undo after a later edit", () => {
    const store = createSalesWorkflowStore();
    const first = store.getState().apply(0, [{ type: "updateNode", id: "enrich-company", patch: { label: "Enrich account" } }]);
    store.getState().apply(1, [{ type: "updateNode", id: "create-opportunity", patch: { label: "Create opportunity" } }]);
    const registered = new Map<string, WebMCPTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const registration = registerWorkflowTools(createToolHandlers(store));

    expect(registered.get("undo_workflow_edit")!.execute({ operationId: first.operationId })).toMatchObject({
      ok: false,
      error: {
        code: "UNDO_REVISION_CONFLICT",
        recovery: { action: "not-retryable", reason: expect.stringContaining("later workflow edit") },
      },
    });
    expect(registered.get("undo_workflow_edit")!.execute({ operationId: "missing" })).toMatchObject({
      ok: false,
      error: {
        code: "UNDO_NOT_AVAILABLE",
        recovery: { tool: "get_edit_result", reason: expect.stringContaining("no longer") },
      },
    });
    registration.unregister();
    delete document.modelContext;
  });

  it("cancels an in-flight DOM wait and does not expose unexpected exception text", async () => {
    const registered = new Map<string, WebMCPTool>();
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { registered.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: modelContext });
    const registration = registerWorkflowTools(createToolHandlers(createWorkflowStore()));
    const controller = new AbortController();
    const pending = registered.get("focus_page_element")!.execute(
      { selector: "#never-rendered" },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toHaveProperty("name", "AbortError");

    registration.unregister();
    delete document.modelContext;

    const failingTools = new Map<string, WebMCPTool>();
    const failingContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPTool) { failingTools.set(tool.name, tool); },
    });
    Object.defineProperty(document, "modelContext", { configurable: true, value: failingContext });
    const failingRegistration = registerWorkflowTools(createToolHandlers(createWorkflowStore(), {
      focusChangeEntry: async (operationId) => ({ operationId, focusedIn: "change-history", visible: true }),
      focusWorkflowNode: async () => ({ focused: true, visible: true }),
      focusDomNode: async () => { throw new Error("internal selector engine detail"); },
    }));

    await expect(failingTools.get("focus_page_element")!.execute({ targetId: "canvas.zoom-in" })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "TOOL_EXECUTION_FAILED",
        message: "The tool could not complete the request.",
        recovery: { tool: "focus_page_element" },
      },
    });
    failingRegistration.unregister();
    delete document.modelContext;
  });
});
