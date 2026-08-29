import { z } from "zod";
import type { WorkflowCommand } from "../graph/commands";
import type { ChangeReceipt, WorkflowChange } from "../receipts/schema";
import surfaceReceiptJsonSchema from "./schemas/surface-receipt.v0.1.schema.json";

const workflowExtension = "urn:web-mcp-proof:workflow";
const surfaceReceiptSchema = z.fromJSONSchema(
  surfaceReceiptJsonSchema as unknown as z.core.JSONSchema.JSONSchema,
);

function commandTouches(command: WorkflowCommand, change: WorkflowChange) {
  const id = change.object.id;
  switch (command.type) {
    case "createNode": return command.node.id === id;
    case "updateNode": return change.object.kind === "workflow-node" && command.id === id;
    case "deleteNode":
      return (change.object.kind === "workflow-node" && command.id === id)
        || (change.action === "disconnected" && change.before !== undefined
          && "source" in change.before
          && (change.before.source === command.id || change.before.target === command.id));
    case "connect": return command.edge.id === id;
    case "disconnect": return command.edgeId === id;
    case "replaceConnection":
      return command.edgeId === id || command.replacement.some((edge) => edge.id === id);
  }
}

function effectsFor(receipt: ChangeReceipt, commands: WorkflowCommand[]) {
  return receipt.changes.map((change) => {
    const commandIndex = commands.findIndex((command) => commandTouches(command, change));
    if (commandIndex < 0) {
      throw new Error(`Cannot map ${change.object.kind} ${change.object.id} to a workflow command.`);
    }
    return {
      commandIndex,
      ...(change.object.kind === "workflow-node"
        ? { itemId: change.object.id }
        : { relationshipId: change.object.id }),
      effect: change.action,
    };
  });
}

export const surfaceReceiptSchemaDescriptor = {
  id: surfaceReceiptJsonSchema.$id,
  status: "draft" as const,
  source: "2D-webmcp/schemas/surface-receipt.v0.1.schema.json",
  version: "0.1" as const,
};

export function workflowSurfaceReceipt(receipt: ChangeReceipt, commands: WorkflowCommand[]) {
  const canUndo = receipt.undo.available && receipt.status === "completed";
  const projected = {
    schemaVersion: "0.1" as const,
    operationId: receipt.operationId,
    surfaceId: "workflow",
    status: receipt.status,
    atomic: true,
    documentVersionBefore: String(receipt.status === "conflict" ? receipt.resultingRevision : receipt.baseRevision),
    documentVersionAfter: String(receipt.resultingRevision),
    effects: effectsFor(receipt, commands),
    undo: {
      availability: canUndo ? "operation-token" as const : "none" as const,
      token: canUndo ? receipt.operationId : null,
    },
    verification: receipt.status === "completed" ? "native-diff" as const : "native-result" as const,
    summary: receipt.summary,
    ...(receipt.failure || receipt.recovery ? {
      extensions: {
        [workflowExtension]: {
          ...(receipt.failure ? { failure: receipt.failure } : {}),
          ...(receipt.recovery ? { recovery: receipt.recovery } : {}),
        },
      },
    } : {}),
  };
  surfaceReceiptSchema.parse(projected);
  return projected;
}
