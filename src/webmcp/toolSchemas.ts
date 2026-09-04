import { z } from "zod";
import { MAX_COMMANDS_PER_BATCH, type WorkflowCommand } from "../graph/commands";
import type { WorkflowNode } from "../graph/model";
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
const nodeSchema = z.object({
  id: idSchema,
  type: z.enum(nodeKinds).describe("Workflow node type."),
  label: labelSchema,
  properties: propertiesSchema.describe("Up to 4 node-specific scalar properties; names and string values are length-limited."),
}).strict().describe("Complete workflow node definition.");
const creatableNodeSchema = nodeSchema.extend({
  properties: propertiesSchema.optional().describe("Optional node-specific scalar properties, up to 4."),
}).strict();
const edgeEndpointSchema = z.object({
  nodeId: idSchema,
  port: portSchema,
}).strict().describe("Workflow node and port endpoint.");
const edgeSchema = z.object({
  id: idSchema,
  source: edgeEndpointSchema.describe(`Existing source node and a valid output port returned by ${toolNames.discoverWorkflow}.`),
  target: edgeEndpointSchema.describe(`Existing target node and a valid input port returned by ${toolNames.discoverWorkflow}.`),
  label: z.string().max(120).regex(printableTextPattern).optional().describe("Optional human-readable connection label."),
}).strict().describe("Complete workflow connection definition.");
export const workflowCommandTypes = [
  "createNode",
  "updateNode",
  "deleteNode",
  "connect",
  "disconnect",
] as const;

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createNode"), node: creatableNodeSchema }).strict().describe("Create one new node."),
  z.object({
    type: z.literal("updateNode"),
    id: idSchema.describe("Existing node ID."),
    patch: nodeSchema.omit({ id: true }).partial().strict().describe("Only fields that should change; node IDs cannot be changed."),
  }).strict().describe("Update an existing node."),
  z.object({ type: z.literal("deleteNode"), id: idSchema }).strict().describe("Delete an existing node and its attached connections."),
  z.object({ type: z.literal("connect"), edge: edgeSchema }).strict().describe("Create one new connection."),
  z.object({ type: z.literal("disconnect"), edgeId: idSchema }).strict().describe("Delete one existing connection."),
]);
export const applyInputSchema = z.object({
  baseRevision: z.number().int().nonnegative().optional().describe(`Use ${toolNames.discoverWorkflow}'s revision exactly. Omit only for an empty-canvas create.`),
  commands: z.array(commandSchema).min(1).max(MAX_COMMANDS_PER_BATCH).describe("Atomic workflow edits. Every command must match one documented command type."),
}).strict();

function normalizeEdge(edge: z.infer<typeof edgeSchema>) {
  return {
    id: edge.id,
    source: edge.source.nodeId,
    sourcePort: edge.source.port,
    target: edge.target.nodeId,
    targetPort: edge.target.port,
    ...(edge.label === undefined ? {} : { label: edge.label }),
  };
}

function automaticPosition(existingNodes: WorkflowNode[], creationIndex: number) {
  if (existingNodes.length === 0) {
    return {
      x: 100 + (creationIndex % 4) * 300,
      y: 100 + Math.floor(creationIndex / 4) * 200,
    };
  }
  const rightEdge = Math.max(...existingNodes.map((node) => node.position.x)) + 300;
  const topEdge = Math.min(...existingNodes.map((node) => node.position.y));
  return {
    x: rightEdge + Math.floor(creationIndex / 4) * 300,
    y: topEdge + (creationIndex % 4) * 180,
  };
}

export function normalizeCommands(
  commands: z.infer<typeof commandSchema>[],
  existingNodes: WorkflowNode[] = [],
): WorkflowCommand[] {
  let creationIndex = 0;
  return commands.map((command) => {
    switch (command.type) {
      case "createNode": {
        const position = automaticPosition(existingNodes, creationIndex);
        creationIndex += 1;
        return {
          type: command.type,
          node: {
            ...command.node,
            properties: command.node.properties ?? {},
            position,
          },
        };
      }
      case "connect":
        return { ...command, edge: normalizeEdge(command.edge) };
      default:
        return command;
    }
  });
}
const objectReferenceInputSchema = z.object({
  kind: z.enum(["workflow-node", "workflow-edge", "change-receipt"]).describe("Object category."),
  id: idSchema,
}).strict();
export const inspectInputSchema = z.object({
  objects: z.array(objectReferenceInputSchema).min(1).max(5).describe(`Up to 5 current item references copied from ${toolNames.discoverWorkflow}.`),
  detail: z.enum(["summary", "properties", "relationships", "changes"]).optional().describe("Detail to return; summary is the compact default."),
  cursor: z.number().int().nonnegative().optional().describe("Relationship or change cursor."),
  limit: z.number().int().min(1).max(5).optional().describe("Relationships or changes to return, from 1 to 5."),
}).strict();
export const showTargetInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["workflow-node", "workflow-edge"]), id: idSchema }).strict(),
  z.object({ kind: z.literal("change-receipt"), id: idSchema }).strict(),
  z.object({ kind: z.literal("page-element"), id: z.enum(uiTargetIds) }).strict(),
]);
export const operationInputSchema = z.object({ operationId: z.string().min(1).max(100).regex(identifierPattern).describe(`Edit result operation ID returned by ${toolNames.editWorkflow}.`) }).strict();
export const discoveryInputSchema = z.object({
  cursor: z.number().int().nonnegative().optional().describe("Zero-based item cursor; omit on the first discovery call."),
  limit: z.number().int().min(1).max(8).optional().describe("Number of compact item references to return, from 1 to 8."),
}).strict();

function withoutDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDescriptions);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "description" && key !== "pattern")
      .map(([key, entry]) => [key, withoutDescriptions(entry)]),
  );
}

const jsonSchemaFor = (schema: z.ZodType, compact = false) => {
  const jsonSchema = z.toJSONSchema(schema, { reused: compact ? "inline" : "ref" });
  Reflect.deleteProperty(jsonSchema, "$schema");
  return (compact ? withoutDescriptions(jsonSchema) : jsonSchema) as object;
};

export const jsonSchemas = {
  discovery: jsonSchemaFor(discoveryInputSchema),
  inspect: jsonSchemaFor(inspectInputSchema),
  apply: jsonSchemaFor(applyInputSchema, true),
  showTarget: jsonSchemaFor(showTargetInputSchema),
  operation: jsonSchemaFor(operationInputSchema),
};
