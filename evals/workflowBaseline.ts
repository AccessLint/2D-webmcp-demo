import type { WorkflowState } from "../src/graph/model";
import type { ChangeReceipt } from "../src/receipts/schema";
import { nodeDefinitions } from "../src/graph/nodeTypes";

const scalar = { type: ["string", "number", "boolean"] };

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
  receipt: {
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

export const workflowBaselineSchemas = {
  snapshot: {
    title: "Workflow baseline snapshot",
    type: "object",
    properties: {
      revision: { type: "integer", minimum: 0 },
      nodes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" }, type: { type: "string" }, label: { type: "string" },
            x: { type: "number" }, y: { type: "number" },
            properties: { type: "object", additionalProperties: scalar },
            inputs: { type: "array", items: { type: "string" } },
            outputs: { type: "array", items: { type: "string" } },
          },
          required: ["id", "type", "label", "x", "y", "properties", "inputs", "outputs"],
          additionalProperties: false,
        },
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" }, source: { type: "string" }, sourcePort: { type: "string" },
            target: { type: "string" }, targetPort: { type: "string" }, label: { type: "string" },
          },
          required: ["id", "source", "sourcePort", "target", "targetPort"],
          additionalProperties: false,
        },
      },
    },
    required: ["revision", "nodes", "edges"],
    additionalProperties: false,
  },
  receipt: {
    title: "Workflow baseline receipt",
    type: "object",
    properties: {
      operationId: { type: "string" }, status: { enum: ["completed", "partial", "failed", "conflict"] },
      baseRevision: { type: "integer" }, resultingRevision: { type: "integer" }, summary: { type: "string" },
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: { action: { type: "string" }, kind: { type: "string" }, id: { type: "string" }, label: { type: "string" } },
          required: ["action", "kind", "id", "label"], additionalProperties: false,
        },
      },
      undoOperationId: { type: ["string", "null"] },
    },
    required: ["operationId", "status", "baseRevision", "resultingRevision", "summary", "changes", "undoOperationId"],
    additionalProperties: false,
  },
};

export function workflowBaselineSnapshot(state: WorkflowState) {
  return {
    revision: state.revision,
    nodes: state.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      x: node.position.x,
      y: node.position.y,
      properties: node.properties,
      inputs: [...nodeDefinitions[node.type].inputs],
      outputs: [...nodeDefinitions[node.type].outputs],
    })),
    edges: state.edges.map((edge) => ({ ...edge })),
  };
}

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

export function workflowBaselineReceipt(receipt: ChangeReceipt) {
  return {
    operationId: receipt.operationId,
    status: receipt.status,
    baseRevision: receipt.baseRevision,
    resultingRevision: receipt.resultingRevision,
    summary: receipt.summary,
    changes: receipt.changes.map((change) => ({
      action: change.action,
      kind: change.object.kind,
      id: change.object.id,
      label: change.object.label,
    })),
    undoOperationId: receipt.undo.operationId ?? null,
  };
}

export function genericEditorReceipt(receipt: ChangeReceipt) {
  return {
    status: receipt.status,
    changed: receipt.changes.map((change) => ({
      id: change.object.id,
      action: change.action,
    })),
  };
}
