import { z } from "zod";
import type { WorkflowCommand } from "../graph/commands";
import { nodeKinds } from "../graph/model";
import { uiTargetIds } from "./uiTargets";
import { toolNames } from "./toolNames";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
// eslint-disable-next-line no-control-regex -- Intentionally reject the portable C0/C1 control-character ranges.
const printableTextPattern = /^[^\x00-\x1F\x7F-\x9F]*$/;
const idSchema = z.string().min(1).max(64).regex(identifierPattern).describe("Stable application ID copied from discovery output or supplied for a new object.");
const labelSchema = z.string().min(1).max(120).regex(printableTextPattern);
const portSchema = z.string().min(1).max(40).regex(identifierPattern);
const propertyValueSchema = z.union([z.string().max(120).regex(printableTextPattern), z.number().finite(), z.boolean()]);
const propertiesSchema = z.record(z.string().min(1).max(40).regex(identifierPattern), propertyValueSchema)
  .refine((properties) => Object.keys(properties).length <= 4, "A node can have at most 4 properties.")
  .meta({ maxProperties: 4 });
const positionSchema = z.object({
  x: z.number().describe("Horizontal canvas coordinate."),
  y: z.number().describe("Vertical canvas coordinate."),
}).strict().describe("Canvas position in pixels.");
const editableLabelSchema = z.union([
  labelSchema,
  z.object({
    value: labelSchema,
    source: z.enum(["native", "author", "derived"]).optional(),
  }).strict(),
]).describe("Human-readable node label. Accepts either a string or the label object copied from a SurfaceSnapshot item.");
const nodeSchema = z.object({
  id: idSchema,
  type: z.enum(nodeKinds).describe(`Workflow node type. Consult ${toolNames.discoverWorkflow} for its valid ports.`),
  label: editableLabelSchema,
  position: positionSchema,
  properties: propertiesSchema.describe("Up to 4 node-specific scalar properties; names and string values are length-limited."),
}).strict().describe("Complete workflow node definition.");
const creatableNodeSchema = nodeSchema.extend({
  properties: propertiesSchema.default({}).describe("Optional node-specific scalar properties, up to 4. Omit when the node has no properties."),
}).strict();
const edgeSchema = z.object({
  id: idSchema,
  source: idSchema.describe("Existing source node ID."),
  sourcePort: portSchema.describe(`Valid output port returned for the source node by ${toolNames.discoverWorkflow}.`),
  target: idSchema.describe("Existing target node ID."),
  targetPort: portSchema.describe(`Valid input port returned for the target node by ${toolNames.discoverWorkflow}.`),
  label: z.string().max(120).regex(printableTextPattern).optional().describe("Optional human-readable connection label."),
}).strict().describe("Complete workflow connection definition.");
export const workflowCommandTypes = [
  "createNode",
  "updateNode",
  "deleteNode",
  "connect",
  "disconnect",
  "replaceConnection",
] as const;

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createNode"), node: creatableNodeSchema }).strict().describe("Create one new node."),
  z.object({ type: z.literal("updateNode"), id: idSchema, patch: nodeSchema.omit({ id: true }).partial().strict().describe("Only fields that should change; node IDs cannot be changed.") }).strict().describe("Update an existing node."),
  z.object({ type: z.literal("deleteNode"), id: idSchema }).strict().describe("Delete an existing node and its attached connections."),
  z.object({ type: z.literal("connect"), edge: edgeSchema }).strict().describe("Create one new connection."),
  z.object({ type: z.literal("disconnect"), edgeId: idSchema }).strict().describe("Delete one existing connection."),
  z.object({ type: z.literal("replaceConnection"), edgeId: idSchema, replacement: z.array(edgeSchema).max(10).describe("Connections that replace the existing edge atomically.") }).strict().describe("Replace one connection with up to ten new connections."),
]);
export const applyInputSchema = z.object({
  baseRevision: z.number().int().nonnegative().describe(`Use ${toolNames.discoverWorkflow}'s revision exactly, or Number(surface.documentVersion) when its result is a SurfaceSnapshot. Do not increment it.`),
  commands: z.array(commandSchema).min(1).max(20).describe("Atomic workflow edits. Every command must match one documented command type."),
  intent: z.string().max(500).optional().describe("Optional short explanation of the requested change."),
}).strict();

const labelValue = (label: z.infer<typeof editableLabelSchema>) => typeof label === "string" ? label : label.value;

export function normalizeCommands(commands: z.infer<typeof commandSchema>[]): WorkflowCommand[] {
  return commands.map((command) => {
    switch (command.type) {
      case "createNode":
        return { ...command, node: { ...command.node, label: labelValue(command.node.label) } };
      case "updateNode": {
        const { label, ...patch } = command.patch;
        return { ...command, patch: label === undefined ? patch : { ...patch, label: labelValue(label) } };
      }
      default:
        return command;
    }
  });
}
const objectReferenceInputSchema = z.object({
  kind: z.enum(["workflow-node", "workflow-edge"]).describe("Object category."),
  id: idSchema,
}).strict();
export const inspectInputSchema = z.object({
  objects: z.array(objectReferenceInputSchema).min(1).max(5).describe(`Up to 5 current item references copied from ${toolNames.discoverWorkflow}.`),
  detail: z.enum(["summary", "properties", "relationships"]).optional().describe("Detail to return; summary is the compact default."),
  cursor: z.number().int().nonnegative().optional().describe("Relationship cursor when detail is relationships."),
  limit: z.number().int().min(1).max(3).optional().describe("Relationships per item, from 1 to 3."),
}).strict();
export const revealInputSchema = objectReferenceInputSchema;
export const focusTargetInputSchema = z.object({
  targetId: z.enum(uiTargetIds).describe(`Stable page target ID returned by ${toolNames.discoverWorkflow}.`),
}).strict();
export const focusDomNodeInputSchema = z.union([
  focusTargetInputSchema,
  z.object({ selector: z.string().min(1).max(500).describe("Advanced fallback CSS selector for a focusable DOM element.") }).strict(),
]);
export const operationInputSchema = z.object({ operationId: z.string().min(1).max(100).regex(identifierPattern).describe(`Edit result operation ID returned by ${toolNames.editWorkflow}.`) }).strict();
export const getEditResultInputSchema = operationInputSchema.extend({
  changeCursor: z.number().int().nonnegative().optional().describe("Zero-based change cursor; omit for the first page."),
  changeLimit: z.number().int().min(1).max(5).optional().describe("Changes to return, from 1 to 5."),
}).strict();
export const discoveryInputSchema = z.object({
  cursor: z.number().int().nonnegative().optional().describe("Zero-based item cursor; omit on the first discovery call."),
  limit: z.number().int().min(1).max(8).optional().describe("Number of compact item references to return, from 1 to 8."),
}).strict();

const jsonSchemaFor = (schema: z.ZodType) => {
  const jsonSchema = z.toJSONSchema(schema);
  Reflect.deleteProperty(jsonSchema, "$schema");
  return jsonSchema;
};

export const jsonSchemas = {
  discovery: jsonSchemaFor(discoveryInputSchema),
  inspect: jsonSchemaFor(inspectInputSchema),
  apply: jsonSchemaFor(applyInputSchema),
  reveal: jsonSchemaFor(revealInputSchema),
  focusDomNode: jsonSchemaFor(focusTargetInputSchema),
  operation: jsonSchemaFor(operationInputSchema),
  getEditResult: jsonSchemaFor(getEditResultInputSchema),
};
