import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createWorkflowStore } from "../src/state/workflowStore";
import { createToolHandlers } from "../src/webmcp/toolHandlers";
import { workflowToolDefinitions } from "../src/webmcp/registerTools";
import { toolNames } from "../src/webmcp/toolNames";
import { workflowSurfaceReceipt } from "../src/webmcp/surfaceReceipt";
import surfaceSnapshotJsonSchema from "../src/webmcp/schemas/surface-snapshot.v0.1.schema.json";
import surfaceReceiptJsonSchema from "../src/webmcp/schemas/surface-receipt.v0.1.schema.json";
import {
  genericEditorResult,
  genericEditorSchemas,
  genericEditorSnapshot,
} from "./genericEditorBaseline";
import {
  workflowBaselineReceipt,
  workflowBaselineSchemas,
  workflowBaselineSnapshot,
} from "./workflowBaseline";

type BridgeRequest = {
  id: number;
  method: "listTools" | "execute" | "bumpRevision" | "snapshot";
  params?: Record<string, unknown>;
};

const exposedTools = new Set([toolNames.discoverWorkflow, toolNames.editWorkflow]);

export function createSurfaceEvalSession() {
  const store = createWorkflowStore();
  const handlers = createToolHandlers(store);

  return {
    listTools() {
      return workflowToolDefinitions(handlers)
        .filter((tool) => exposedTools.has(tool.name))
        .map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          outputSchemas: tool.name === toolNames.discoverWorkflow
            ? { genericEditor: genericEditorSchemas.snapshot, workflowBaseline: workflowBaselineSchemas.snapshot, surfaceRfc: surfaceSnapshotJsonSchema }
            : { genericEditor: genericEditorSchemas.result, workflowBaseline: workflowBaselineSchemas.receipt, surfaceRfc: surfaceReceiptJsonSchema },
        }));
    },
    async execute(name: string, input: unknown) {
      if (!exposedTools.has(name)) throw new Error(`Tool ${name} is not exposed by the surface eval bridge.`);
      const execute = handlers[name as keyof typeof handlers];
      if (typeof execute !== "function") throw new Error(`Unknown workflow tool: ${name}`);
      const native = await execute(input, {});
      if (name !== toolNames.editWorkflow) {
        return {
          native,
          outputs: {
            genericEditor: genericEditorSnapshot(store.getState().workflow),
            workflowBaseline: workflowBaselineSnapshot(store.getState().workflow),
            surfaceRfc: native.surfaceSnapshot,
          },
        };
      }
      const commands = (input as { commands: Parameters<typeof workflowSurfaceReceipt>[1] }).commands;
      return {
        native,
        outputs: {
          genericEditor: genericEditorResult(native),
          workflowBaseline: workflowBaselineReceipt(native),
          surfaceRfc: workflowSurfaceReceipt(native, commands),
        },
      };
    },
    bumpRevision() {
      const workflow = store.getState().workflow;
      const node = workflow.nodes.find((item) => item.id === "alert-team");
      if (!node) throw new Error("The eval fixture is missing alert-team.");
      return store.getState().apply(workflow.revision, [{
        type: "updateNode",
        id: node.id,
        patch: { position: { x: node.position.x + 1, y: node.position.y } },
      }], "Concurrent edit injected by the eval harness");
    },
    snapshot() {
      const state = store.getState();
      return {
        revision: state.workflow.revision,
        targetLabel: state.workflow.nodes.find((item) => item.id === "fetch-orders")?.label ?? null,
        itemCount: state.workflow.nodes.length,
        relationshipCount: state.workflow.edges.length,
      };
    },
  };
}

async function handle(session: ReturnType<typeof createSurfaceEvalSession>, request: BridgeRequest) {
  switch (request.method) {
    case "listTools": return session.listTools();
    case "execute": return session.execute(String(request.params?.name), request.params?.input);
    case "bumpRevision": return session.bumpRevision();
    case "snapshot": return session.snapshot();
  }
}

export async function runSurfaceBridge() {
  const session = createSurfaceEvalSession();
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    let request: BridgeRequest | undefined;
    try {
      request = JSON.parse(line) as BridgeRequest;
      const result = await handle(session, request);
      process.stdout.write(`${JSON.stringify({ id: request.id, ok: true, result })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        id: request?.id ?? null,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })}\n`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runSurfaceBridge();
}
