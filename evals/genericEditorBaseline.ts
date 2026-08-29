import type { WorkflowState } from "../src/graph/model";
import type { ChangeReceipt } from "../src/receipts/schema";

export const genericEditorSchemas = {
  snapshot: {
    title: "Generic editor snapshot",
    type: "object",
    properties: {
      revision: { type: "integer", minimum: 0 },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" }, label: { type: "string" },
            x: { type: "number" }, y: { type: "number" },
          },
          required: ["id", "label", "x", "y"],
          additionalProperties: false,
        },
      },
      relationships: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" }, sourceId: { type: "string" }, sourceTerminal: { type: "string" },
            targetId: { type: "string" }, targetTerminal: { type: "string" },
          },
          required: ["id", "sourceId", "sourceTerminal", "targetId", "targetTerminal"],
          additionalProperties: false,
        },
      },
    },
    required: ["revision", "items", "relationships"],
    additionalProperties: false,
  },
  result: {
    title: "Generic editor result",
    type: "object",
    properties: {
      status: { enum: ["completed", "partial", "failed", "conflict"] },
      changed: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, action: { type: "string" } },
          required: ["id", "action"],
          additionalProperties: false,
        },
      },
    },
    required: ["status", "changed"],
    additionalProperties: false,
  },
};

export function genericEditorSnapshot(state: WorkflowState) {
  return {
    revision: state.revision,
    items: state.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      x: node.position.x,
      y: node.position.y,
    })),
    relationships: state.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.source,
      sourceTerminal: edge.sourcePort,
      targetId: edge.target,
      targetTerminal: edge.targetPort,
    })),
  };
}

export function genericEditorResult(change: ChangeReceipt) {
  return {
    status: change.status,
    changed: change.changes.map((entry) => ({
      id: entry.object.id,
      action: entry.action,
    })),
  };
}
