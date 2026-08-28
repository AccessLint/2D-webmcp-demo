import { z } from "zod";
import type { ApplicationReference, WorkflowEdge, WorkflowNode } from "../graph/model";
import type { ValidationResult } from "../graph/validation";
import type { BatchFailureCode } from "../graph/commands";
import { toolNames } from "../webmcp/toolNames";

export type ChangeAction = "created" | "updated" | "deleted" | "connected" | "disconnected" | "restored";

export type WorkflowChange = {
  action: ChangeAction;
  object: ApplicationReference;
  before?: WorkflowNode | WorkflowEdge;
  after?: WorkflowNode | WorkflowEdge;
};

export type ChangeReceipt = {
  schemaVersion: "0.1";
  operationId: string;
  timestamp: string;
  baseRevision: number;
  resultingRevision: number;
  status: "completed" | "partial" | "failed" | "conflict";
  summary: string;
  intent?: string;
  affected: ApplicationReference[];
  changes: WorkflowChange[];
  validation: ValidationResult;
  warnings: ValidationResult["problems"];
  undo: { available: boolean; operationId?: string };
  failure?: { code: BatchFailureCode; message: string };
  recovery?: { tool: typeof toolNames.discoverWorkflow; input: Record<string, never>; currentRevision: number; then: typeof toolNames.editWorkflow };
};

const referenceSchema = z.object({
  kind: z.enum(["workflow-node", "workflow-edge", "change-receipt"]),
  id: z.string(),
  label: z.string(),
  href: z.string(),
});

export const changeReceiptSchema: z.ZodType<ChangeReceipt> = z.object({
  schemaVersion: z.literal("0.1"),
  operationId: z.string(),
  timestamp: z.iso.datetime(),
  baseRevision: z.number().int().nonnegative(),
  resultingRevision: z.number().int().nonnegative(),
  status: z.enum(["completed", "partial", "failed", "conflict"]),
  summary: z.string(),
  intent: z.string().optional(),
  affected: z.array(referenceSchema),
  changes: z.array(z.object({
    action: z.enum(["created", "updated", "deleted", "connected", "disconnected", "restored"]),
    object: referenceSchema,
    before: z.unknown().optional(),
    after: z.unknown().optional(),
  })) as z.ZodType<WorkflowChange[]>,
  validation: z.object({
    valid: z.boolean(),
    problems: z.array(z.object({
      code: z.string(), severity: z.enum(["error", "warning"]), message: z.string(), target: referenceSchema.optional(),
    })),
  }),
  warnings: z.array(z.object({
    code: z.string(), severity: z.enum(["error", "warning"]), message: z.string(), target: referenceSchema.optional(),
  })),
  undo: z.object({ available: z.boolean(), operationId: z.string().optional() }),
  failure: z.object({
    code: z.enum(["REVISION_CONFLICT", "INVALID_COMMAND", "NOT_FOUND", "ALREADY_EXISTS", "VALIDATION_FAILED"]),
    message: z.string(),
  }).optional(),
  recovery: z.object({
    tool: z.literal(toolNames.discoverWorkflow), input: z.object({}), currentRevision: z.number().int().nonnegative(), then: z.literal(toolNames.editWorkflow),
  }).optional(),
});
