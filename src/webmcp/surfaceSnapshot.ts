import { z } from "zod";
import type { WorkflowState } from "../graph/model";
import { nodeDefinitions } from "../graph/nodeTypes";
import surfaceSnapshotJsonSchema from "./schemas/surface-snapshot.v0.1.schema.json";

const workflowExtension = "urn:web-mcp-proof:workflow";
const surfaceSnapshotSchema = z.fromJSONSchema(
  surfaceSnapshotJsonSchema as unknown as z.core.JSONSchema.JSONSchema,
);

export const surfaceSchemaDescriptor = {
  id: surfaceSnapshotJsonSchema.$id,
  status: "draft" as const,
  source: "2D-webmcp/schemas/surface-snapshot.v0.1.schema.json",
  version: "0.1" as const,
};

export function workflowSurfaceSnapshot(state: WorkflowState) {
  const snapshot = {
    schemaVersion: "0.1" as const,
    surface: {
      id: "workflow",
      documentVersion: String(state.revision),
      coordinateSystems: [
        { id: "world", units: "surface-unit", origin: "top-left" },
      ],
      capabilities: {
        atomicity: "arbitrary-batch",
        revisionPreconditions: true,
        undo: "operation-token",
      },
    },
    items: state.nodes.map((node) => ({
      id: node.id,
      kind: "workflow-node",
      label: { value: node.label, source: "author" },
      geometry: {
        type: "point",
        coordinateSpaceId: "world",
        origin: "top-left",
        x: node.position.x,
        y: node.position.y,
      },
      supportedActions: ["translate", "edit-label", "delete"],
      extensions: {
        [workflowExtension]: {
          nodeType: node.type,
          properties: node.properties,
          inputs: [...nodeDefinitions[node.type].inputs],
          outputs: [...nodeDefinitions[node.type].outputs],
        },
      },
    })),
    relationships: state.edges.map((edge) => ({
      id: edge.id,
      type: "connects",
      from: { itemId: edge.source, terminal: edge.sourcePort },
      to: { itemId: edge.target, terminal: edge.targetPort },
      extensions: edge.label ? { [workflowExtension]: { label: edge.label } } : undefined,
    })),
  };
  surfaceSnapshotSchema.parse(snapshot);
  return snapshot;
}
