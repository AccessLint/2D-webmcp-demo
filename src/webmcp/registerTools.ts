import { ZodError, type ZodIssue } from "zod";
import { realRunTracer } from "../evals/realRunTrace";
import { MAX_COMMANDS_PER_BATCH } from "../graph/commands";
import { nodeDefinitions } from "../graph/nodeTypes";
import type { InvocationInput } from "../state/workflowStore";
import type { ToolHandlers } from "./toolHandlers";
import { jsonSchemas, workflowCommandTypes } from "./toolSchemas";
import { ToolError } from "./errors";
import { toolNames, type ToolName } from "./toolNames";
import { fitToolOutput } from "./toolOutputs";

const nodePortGuide = Object.entries(nodeDefinitions)
  .map(([type, definition]) => `${type}: inputs [${definition.inputs.join(", ")}], outputs [${definition.outputs.join(", ")}]`)
  .join("; ");

function flattenIssues(
  issues: ZodIssue[],
  parentPath: Array<string | number> = [],
): Array<{ path: Array<string | number>; code: string; message: string }> {
  return issues.flatMap((issue) => {
    const path = [...parentPath, ...issue.path.map((part) => typeof part === "symbol"
      ? part.description ?? String(part)
      : part)];
    if (issue.code === "invalid_union" && issue.errors.length > 0) {
      return issue.errors.flatMap((branch) => flattenIssues(branch, path));
    }
    const invalidCommandType = issue.code === "invalid_union"
      && "discriminator" in issue
      && issue.discriminator === "type";
    return [{
      path,
      code: issue.code,
      message: invalidCommandType
        ? `Expected command type to be one of: ${workflowCommandTypes.join(", ")}. Put it in the command's type field.`
        : issue.message,
    }];
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

const editCommandExamples = {
  createNode: {
    type: "createNode",
    node: { id: "new-action", type: "action", label: "New action" },
  },
  connect: {
    type: "connect",
    edge: {
      id: "edge-new",
      source: { nodeId: "source-id", port: "success" },
      target: { nodeId: "target-id", port: "input" },
    },
  },
} as const;

function isReceiptInspection(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const objects = (input as { objects?: unknown }).objects;
  return Array.isArray(objects) && objects.some((object) => (
    object && typeof object === "object" && "kind" in object && object.kind === "change-receipt"
  ));
}

function recoveryFor(tool: ToolName, invalidInput: boolean, code?: string, input?: unknown) {
  if (invalidInput && tool === toolNames.editWorkflow) {
    return {
      tool,
      reason: "Correct the listed fields and retry from commandExamples. Every command needs a top-level type; node.label belongs directly on node; source and target each contain nodeId and port.",
      commandExamples: editCommandExamples,
    };
  }
  if (invalidInput) return { tool, reason: "Correct the listed input fields and retry." };
  if (code === "UNDO_REVISION_CONFLICT") {
    return { action: "not-retryable", reason: "A later workflow edit makes this operation impossible to undo." };
  }
  if (code === "UNDO_NOT_AVAILABLE") {
    return { tool: toolNames.inspectWorkflowItems, reason: "Inspect the change receipt; this operation no longer has an available undo snapshot." };
  }
  if (tool === toolNames.inspectWorkflowItems) {
    if (isReceiptInspection(input)) {
      return { tool, reason: "Retry with a current operation ID returned by editing or undoing." };
    }
    return { tool: toolNames.discoverWorkflow, reason: "Refresh current workflow item IDs, then retry." };
  }
  if (tool === toolNames.showTarget || tool === toolNames.undoWorkflowEdit) {
    return { tool, reason: "Use a current target ID returned by discovery, editing, or inspection." };
  }
  if (tool === toolNames.editWorkflow) {
    return { tool: toolNames.discoverWorkflow, reason: "Refresh the revision and valid IDs before retrying the edit." };
  }
  return { tool, reason: "Retry the operation after checking the current application state." };
}

function recoveryError(tool: ToolName, error: unknown, input: unknown) {
  const invalidInput = error instanceof ZodError;
  const code = invalidInput ? "INVALID_INPUT" : error instanceof ToolError ? error.code : "TOOL_EXECUTION_FAILED";
  const message = invalidInput
    ? "The input did not match the registered schema."
    : error instanceof ToolError
      ? error.message
      : "The tool could not complete the request.";
  return {
    ok: false,
    error: {
      code,
      message,
      ...(invalidInput ? { issues: flattenIssues(error.issues) } : {}),
      recovery: recoveryFor(tool, invalidInput, code, input),
    },
  };
}

const parameterNamesByTool: Record<ToolName, readonly string[]> = {
  discover_workflow: ["cursor", "limit"],
  inspect_workflow_items: ["objects", "detail", "cursor", "limit"],
  edit_workflow: ["baseRevision", "commands"],
  show_target: ["kind", "id"],
  undo_workflow_edit: ["operationId"],
};

function safeParameterShape(tool: ToolName, input: unknown) {
  const inputRecord = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const inputNames = Object.keys(inputRecord);
  const allowedNames = new Set(parameterNamesByTool[tool]);
  const parameterNames = inputNames.filter((name) => allowedNames.has(name)).sort();
  return {
    inputRecord,
    parameterNames,
    unknownParameterCount: inputNames.length - parameterNames.length,
  };
}

function invocationDetails(tool: ToolName, input: unknown, result: unknown, startedAt: number) {
  const { inputRecord, parameterNames, unknownParameterCount } = safeParameterShape(tool, input);
  const resultRecord = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : {};
  const error = resultRecord.error && typeof resultRecord.error === "object" ? resultRecord.error as Record<string, unknown> : undefined;
  const failure = resultRecord.failure && typeof resultRecord.failure === "object" ? resultRecord.failure as Record<string, unknown> : undefined;
  const code = typeof error?.code === "string" ? error.code : typeof failure?.code === "string" ? failure.code : undefined;
  return {
    tool,
    outcome: code ? "failed" as const : "completed" as const,
    ...(code ? { code } : {}),
    durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
    parameterNames,
    ...(unknownParameterCount > 0 ? { unknownParameterCount } : {}),
    ...(typeof inputRecord.baseRevision === "number"
      ? { baseRevision: inputRecord.baseRevision }
      : typeof resultRecord.baseRevision === "number"
        ? { baseRevision: resultRecord.baseRevision }
        : {}),
    ...(typeof resultRecord.resultingRevision === "number" ? { resultingRevision: resultRecord.resultingRevision } : {}),
    ...(typeof resultRecord.operationId === "string" ? { operationId: resultRecord.operationId } : {}),
  };
}

const withRecovery = (tool: ToolName, handlers: ToolHandlers, execute: WebMCPTool["execute"]): WebMCPTool["execute"] => (input, options) => {
  const startedAt = performance.now();
  const recordInvocation = (invocation: InvocationInput) => {
    handlers.recordInvocation(invocation);
    realRunTracer.recordTool({
      name: tool,
      outcome: invocation.outcome,
      startedAt,
      durationMs: invocation.durationMs,
    });
  };
  const finish = (result: unknown) => {
    const output = fitToolOutput(tool, input, result);
    const invocation = invocationDetails(tool, input, output, startedAt);
    recordInvocation(invocation);
    return output;
  };
  const fail = (error: unknown) => {
    if (options?.signal?.aborted || isAbortError(error)) {
      const { parameterNames, unknownParameterCount } = safeParameterShape(tool, input);
      const invocation = {
        tool,
        outcome: "aborted",
        code: "ABORTED",
        durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
        parameterNames,
        ...(unknownParameterCount > 0 ? { unknownParameterCount } : {}),
      } as const;
      recordInvocation(invocation);
      throw error;
    }
    return finish(recoveryError(tool, error, input));
  };
  try {
    const result = execute(input, options);
    return result instanceof Promise ? result.then(finish, fail) : finish(result);
  } catch (error) {
    return fail(error);
  }
};

export function workflowToolDefinitions(handlers: ToolHandlers): WebMCPTool[] {
  return [
    {
      name: toolNames.discoverWorkflow,
      title: "Discover workflow",
      description: `List current workflow item IDs and labels with the revision required by ${toolNames.editWorkflow}. Follow itemPage.nextCursor for more items. Skip discovery only when the canvas is known to be empty and the task creates a new workflow.`,
      inputSchema: jsonSchemas.discovery,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: handlers[toolNames.discoverWorkflow],
    },
    {
      name: toolNames.inspectWorkflowItems,
      title: "Inspect workflow items",
      description: `Read properties or relationships for discovered workflow items, or paginated changes for a change-receipt operation ID. This tool does not alter the visible selection.`,
      inputSchema: jsonSchemas.inspect,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: handlers[toolNames.inspectWorkflowItems],
    },
    {
      name: toolNames.editWorkflow,
      title: "Edit workflow",
      description: `Atomically apply up to ${MAX_COMMANDS_PER_BATCH} commands. Use these exact shapes: {type:"createNode",node:{id:"node-id",type:"action",label:"Label"}}; {type:"updateNode",id:"node-id",patch:{label:"New label"}}; {type:"deleteNode",id:"node-id"}; {type:"connect",edge:{id:"edge-id",source:{nodeId:"source-id",port:"success"},target:{nodeId:"target-id",port:"input"}}}; {type:"disconnect",edgeId:"edge-id"}. For an existing workflow, use ${toolNames.discoverWorkflow}'s exact revision as baseRevision; omit it only for an empty-canvas create. Node positions are automatic. Reroute with disconnect and connect commands in the same batch. Valid ports are ${nodePortGuide}. A completed receipt is authoritative proof that the atomic edit was validated and committed; do not call ${toolNames.discoverWorkflow} or ${toolNames.inspectWorkflowItems} solely to verify it. The app announces the receipt. On conflict, rediscover before retrying.`,
      inputSchema: jsonSchemas.apply,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: handlers[toolNames.editWorkflow],
    },
    {
      name: toolNames.showTarget,
      title: "Show target",
      description: "Bring a workflow node, edge, change receipt, or named page element into view. Nodes and receipts receive keyboard focus; page-element focus is queued for the next browser interaction.",
      inputSchema: jsonSchemas.showTarget,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: handlers[toolNames.showTarget],
    },
    {
      name: toolNames.undoWorkflowEdit,
      title: "Undo workflow edit",
      description: "Undo the operationId from a successful edit result when it is still the latest graph revision, then return a reversal result.",
      inputSchema: jsonSchemas.operation,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: handlers[toolNames.undoWorkflowEdit],
    },
  ];
}

export function registerWorkflowTools(handlers: ToolHandlers) {
  if (!document.modelContext) return { supported: false, ready: Promise.resolve(false), unregister: () => undefined };

  const controller = new AbortController();
  const registrations = workflowToolDefinitions(handlers).map((tool) => {
    const registeredTool = { ...tool, execute: withRecovery(tool.name as ToolName, handlers, tool.execute) };
    try {
      return Promise.resolve(document.modelContext!.registerTool(registeredTool, { signal: controller.signal }));
    } catch (error) {
      return Promise.reject(error);
    }
  });
  const ready = Promise.all(registrations)
    .then(() => true)
    .catch((error: unknown) => {
      controller.abort();
      handlers.dispose();
      throw new Error("WebMCP tool registration failed.", { cause: error });
    });

  return {
    supported: true,
    ready,
    unregister: () => {
      controller.abort();
      handlers.dispose();
    },
  };
}
