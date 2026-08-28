import { z } from "zod";
import { nodeKinds } from "../graph/model";

const positionSchema = z.object({ x: z.number(), y: z.number() });
const nodeSchema = z.object({
  id: z.string().min(1), type: z.enum(nodeKinds), label: z.string().min(1), position: positionSchema,
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
const edgeSchema = z.object({
  id: z.string().min(1), source: z.string().min(1), sourcePort: z.string().min(1), target: z.string().min(1), targetPort: z.string().min(1), label: z.string().optional(),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createNode"), node: nodeSchema }),
  z.object({ type: z.literal("updateNode"), id: z.string(), patch: nodeSchema.partial() }),
  z.object({ type: z.literal("deleteNode"), id: z.string() }),
  z.object({ type: z.literal("connect"), edge: edgeSchema }),
  z.object({ type: z.literal("disconnect"), edgeId: z.string() }),
  z.object({ type: z.literal("replaceConnection"), edgeId: z.string(), replacement: z.array(edgeSchema).max(10) }),
]);
export const applyInputSchema = z.object({ baseRevision: z.number().int().nonnegative(), commands: z.array(commandSchema).min(1).max(20), intent: z.string().max(500).optional() });
export const inspectInputSchema = z.object({ objects: z.array(z.object({ kind: z.enum(["workflow-node", "workflow-edge"]), id: z.string() })).min(1).max(20) });
export const revealInputSchema = z.object({ kind: z.enum(["workflow-node", "workflow-edge"]), id: z.string() });
export const operationInputSchema = z.object({ operationId: z.string() });

const nodeJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    id: { type: "string" }, type: { enum: [...nodeKinds] }, label: { type: "string" },
    position: { type: "object", additionalProperties: false, properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
    properties: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } },
  }, required: ["id", "type", "label", "position", "properties"],
} as const;
const edgeJsonSchema = {
  type: "object", additionalProperties: false,
  properties: { id: { type: "string" }, source: { type: "string" }, sourcePort: { type: "string" }, target: { type: "string" }, targetPort: { type: "string" }, label: { type: "string" } },
  required: ["id", "source", "sourcePort", "target", "targetPort"],
} as const;
const commandJsonSchema = {
  oneOf: [
    { type: "object", properties: { type: { const: "createNode" }, node: nodeJsonSchema }, required: ["type", "node"] },
    { type: "object", properties: { type: { const: "updateNode" }, id: { type: "string" }, patch: { type: "object", properties: nodeJsonSchema.properties } }, required: ["type", "id", "patch"] },
    { type: "object", properties: { type: { const: "deleteNode" }, id: { type: "string" } }, required: ["type", "id"] },
    { type: "object", properties: { type: { const: "connect" }, edge: edgeJsonSchema }, required: ["type", "edge"] },
    { type: "object", properties: { type: { const: "disconnect" }, edgeId: { type: "string" } }, required: ["type", "edgeId"] },
    { type: "object", properties: { type: { const: "replaceConnection" }, edgeId: { type: "string" }, replacement: { type: "array", maxItems: 10, items: edgeJsonSchema } }, required: ["type", "edgeId", "replacement"] },
  ],
} as const;

export const jsonSchemas = {
  empty: { type: "object", properties: {}, additionalProperties: false },
  inspect: { type: "object", properties: { objects: { type: "array", maxItems: 20, items: { type: "object", properties: { kind: { enum: ["workflow-node", "workflow-edge"] }, id: { type: "string" } }, required: ["kind", "id"] } } }, required: ["objects"] },
  apply: { type: "object", additionalProperties: false, properties: { baseRevision: { type: "integer", minimum: 0 }, intent: { type: "string", maxLength: 500, description: "Agent-supplied intent. Stored as unverified metadata." }, commands: { type: "array", minItems: 1, maxItems: 20, items: commandJsonSchema } }, required: ["baseRevision", "commands"] },
  reveal: { type: "object", properties: { kind: { enum: ["workflow-node", "workflow-edge"] }, id: { type: "string" } }, required: ["kind", "id"] },
  operation: { type: "object", properties: { operationId: { type: "string" } }, required: ["operationId"] },
} as const;
