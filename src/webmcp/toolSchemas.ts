import { z } from "zod";
import { nodeKinds } from "../graph/model";
import { uiTargetIds } from "./uiTargets";

const idSchema = z.string().min(1).describe("Stable application ID copied from discovery output or supplied for a new object.");
const positionSchema = z.object({
  x: z.number().describe("Horizontal canvas coordinate."),
  y: z.number().describe("Vertical canvas coordinate."),
}).strict().describe("Canvas position in pixels.");
const nodeSchema = z.object({
  id: idSchema,
  type: z.enum(nodeKinds).describe("Workflow node type. Consult get_workflow_summary for its valid ports."),
  label: z.string().min(1).describe("Human-readable node label."),
  position: positionSchema,
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).describe("Node-type-specific scalar properties."),
}).strict().describe("Complete workflow node definition.");
const edgeSchema = z.object({
  id: idSchema,
  source: idSchema.describe("Existing source node ID."),
  sourcePort: z.string().min(1).describe("Valid output port returned for the source node by get_workflow_summary."),
  target: idSchema.describe("Existing target node ID."),
  targetPort: z.string().min(1).describe("Valid input port returned for the target node by get_workflow_summary."),
  label: z.string().optional().describe("Optional human-readable connection label."),
}).strict().describe("Complete workflow connection definition.");
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createNode"), node: nodeSchema }).strict().describe("Create one new node."),
  z.object({ type: z.literal("updateNode"), id: idSchema, patch: nodeSchema.omit({ id: true }).partial().strict().describe("Only fields that should change; node IDs cannot be changed.") }).strict().describe("Update an existing node."),
  z.object({ type: z.literal("deleteNode"), id: idSchema }).strict().describe("Delete an existing node and its attached connections."),
  z.object({ type: z.literal("connect"), edge: edgeSchema }).strict().describe("Create one new connection."),
  z.object({ type: z.literal("disconnect"), edgeId: idSchema }).strict().describe("Delete one existing connection."),
  z.object({ type: z.literal("replaceConnection"), edgeId: idSchema, replacement: z.array(edgeSchema).max(10).describe("Connections that replace the existing edge atomically.") }).strict().describe("Replace one connection with up to ten new connections."),
]);
export const applyInputSchema = z.object({
  baseRevision: z.number().int().nonnegative().describe("Copy the current revision from get_workflow_summary."),
  commands: z.array(commandSchema).min(1).max(20).describe("Atomic workflow edits. Every command must match one documented command type."),
  intent: z.string().max(500).optional().describe("Optional short explanation of the requested change."),
}).strict();
const objectReferenceInputSchema = z.object({
  kind: z.enum(["workflow-node", "workflow-edge"]).describe("Object category."),
  id: idSchema,
}).strict();
export const inspectInputSchema = z.object({ objects: z.array(objectReferenceInputSchema).min(1).max(20).describe("Current object references copied from get_workflow_summary.") }).strict();
export const revealInputSchema = objectReferenceInputSchema;
export const focusDomNodeInputSchema = z.union([
  z.object({ targetId: z.enum(uiTargetIds).describe("Stable UI target ID returned by get_workflow_summary.") }).strict(),
  z.object({ selector: z.string().min(1).max(500).describe("Advanced fallback CSS selector for a focusable DOM element.") }).strict(),
]);
export const operationInputSchema = z.object({ operationId: z.string().min(1).describe("Change receipt operation ID returned by apply_workflow_changes.") }).strict();
export const emptyInputSchema = z.object({}).strict();

const jsonSchemaFor = (schema: z.ZodType) => {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
};

export const jsonSchemas = {
  empty: jsonSchemaFor(emptyInputSchema),
  inspect: jsonSchemaFor(inspectInputSchema),
  apply: jsonSchemaFor(applyInputSchema),
  reveal: jsonSchemaFor(revealInputSchema),
  focusDomNode: jsonSchemaFor(focusDomNodeInputSchema),
  operation: jsonSchemaFor(operationInputSchema),
};
