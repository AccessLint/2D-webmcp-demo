import { ZodError, type ZodIssue } from "zod";
import type { ToolHandlers } from "./toolHandlers";
import { jsonSchemas, workflowCommandTypes } from "./toolSchemas";
import { ToolError } from "./errors";
import { toolNames, type ToolName } from "./toolNames";
import { fitToolOutput } from "./toolOutputs";

function flattenIssues(issues: ZodIssue[]): Array<{ path: Array<string | number>; code: string; message: string }> {
  return issues.flatMap((issue) => {
    if (issue.code === "invalid_union" && issue.errors.length > 0) {
      return issue.errors.flatMap((branch) => flattenIssues(branch));
    }
    const invalidCommandType = issue.code === "invalid_union"
      && "discriminator" in issue
      && issue.discriminator === "type";
    return [{
      path: issue.path.map((part) => typeof part === "symbol"
        ? part.description ?? String(part)
        : part),
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
    node: { id: "new-action", type: "action", label: "New action", position: { x: 700, y: 300 }, properties: {} },
  },
  connect: {
    type: "connect",
    edge: { id: "edge-new", source: "source-id", sourcePort: "success", target: "target-id", targetPort: "input" },
  },
  replaceConnection: {
    type: "replaceConnection",
    edgeId: "existing-edge-id",
    replacement: [{ id: "edge-new", source: "source-id", sourcePort: "success", target: "target-id", targetPort: "input" }],
  },
} as const;

function recoveryFor(tool: ToolName, invalidInput: boolean, code?: string) {
  if (invalidInput && tool === toolNames.editWorkflow) {
    return {
      tool,
      reason: "Correct the listed fields and retry. Every command needs a top-level type; never wrap it under a command name.",
      commandExamples: editCommandExamples,
    };
  }
  if (invalidInput) return { tool, reason: "Correct the listed input fields and retry." };
  if (code === "UNDO_REVISION_CONFLICT") {
    return { action: "not-retryable", reason: "A later workflow edit makes this operation impossible to undo." };
  }
  if (code === "UNDO_NOT_AVAILABLE") {
    return { tool: toolNames.getEditResult, reason: "Inspect the receipt; this operation no longer has an available undo snapshot." };
  }
  if (tool === toolNames.inspectWorkflowItems || tool === toolNames.showWorkflowItem) {
    return { tool: toolNames.discoverWorkflow, reason: "Refresh current workflow item IDs, then retry." };
  }
  if (tool === toolNames.getEditResult || tool === toolNames.showEditResult || tool === toolNames.undoWorkflowEdit) {
    return { tool, reason: "Use a current operationId returned by edit_workflow or undo_workflow_edit." };
  }
  if (tool === toolNames.focusPageElement) {
    return { tool, reason: "Use a named targetId and retry after the target is available in the page." };
  }
  if (tool === toolNames.editWorkflow) {
    return { tool: toolNames.discoverWorkflow, reason: "Refresh the revision and valid IDs before retrying the edit." };
  }
  return { tool, reason: "Retry the operation after checking the current application state." };
}

function recoveryError(tool: ToolName, error: unknown) {
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
      recovery: recoveryFor(tool, invalidInput, code),
    },
  };
}

const parameterNamesByTool: Record<ToolName, readonly string[]> = {
  discover_workflow: ["cursor", "limit", "problemCursor", "problemLimit"],
  inspect_workflow_items: ["objects", "detail", "cursor", "limit"],
  edit_workflow: ["baseRevision", "commands", "intent"],
  show_workflow_item: ["kind", "id"],
  focus_page_element: ["targetId", "selector"],
  get_edit_result: ["operationId", "changeCursor", "changeLimit", "problemCursor", "problemLimit"],
  show_edit_result: ["operationId"],
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
    ...(typeof inputRecord.baseRevision === "number" ? { baseRevision: inputRecord.baseRevision } : {}),
    ...(typeof resultRecord.resultingRevision === "number" ? { resultingRevision: resultRecord.resultingRevision } : {}),
    ...(typeof resultRecord.operationId === "string" ? { operationId: resultRecord.operationId } : {}),
  };
}

const withRecovery = (tool: ToolName, handlers: ToolHandlers, execute: WebMCPTool["execute"]): WebMCPTool["execute"] => (input, options) => {
  const startedAt = performance.now();
  const finish = (result: unknown) => {
    const output = fitToolOutput(tool, input, result);
    handlers.recordInvocation(invocationDetails(tool, input, output, startedAt));
    return output;
  };
  const fail = (error: unknown) => {
    if (options?.signal?.aborted || isAbortError(error)) {
      const { parameterNames, unknownParameterCount } = safeParameterShape(tool, input);
      handlers.recordInvocation({
        tool,
        outcome: "aborted",
        code: "ABORTED",
        durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
        parameterNames,
        ...(unknownParameterCount > 0 ? { unknownParameterCount } : {}),
      });
      throw error;
    }
    return finish(recoveryError(tool, error));
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
      description: "Call this first, once per task, and again only after conflicts or when following nextCursor. Returns a compact page of item IDs, labels, revision, valid ports, page targets, and next steps. If it answers a request to list what is on the canvas, do not call this tool again or inspect every item.",
      inputSchema: jsonSchemas.discovery,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: handlers[toolNames.discoverWorkflow],
    },
    {
      name: toolNames.inspectWorkflowItems,
      title: "Inspect workflow items",
      description: `Call after ${toolNames.discoverWorkflow} only when detailed properties or relationships are requested. Returns data only; it does not select or reveal an item. For select, show, reveal, or bring into view, use ${toolNames.showWorkflowItem}.`,
      inputSchema: jsonSchemas.inspect,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: handlers[toolNames.inspectWorkflowItems],
    },
    {
      name: toolNames.editWorkflow,
      title: "Edit workflow",
      description: `Call after ${toolNames.discoverWorkflow}. Reuse existing IDs from its itemPage; never create a node already listed there. Set baseRevision to its exact revision, or Number(surface.documentVersion) for a SurfaceSnapshot. Do not increment it. Every command object needs a top-level type, for example {type:"createNode",node:{...}}. Never wrap a command as {createNode:{...}}. Node properties may be omitted when empty. Edge endpoints are source and target, not sourceId and targetId. Atomically applies up to 20 commands; updateNode patch.label accepts a string or a copied Snapshot label object. On conflict, follow recovery.`,
      inputSchema: jsonSchemas.apply,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: handlers[toolNames.editWorkflow],
    },
    {
      name: toolNames.showWorkflowItem,
      title: "Show workflow item",
      description: `Use this after ${toolNames.discoverWorkflow} whenever the user asks to select, show, reveal, or bring an item into view. Do not substitute ${toolNames.inspectWorkflowItems}; inspection does not change the visible selection. For nodes, this also moves verified keyboard focus to the node.`,
      inputSchema: jsonSchemas.reveal,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: handlers[toolNames.showWorkflowItem],
    },
    {
      name: toolNames.focusPageElement,
      title: "Focus page element",
      description: `Always call ${toolNames.discoverWorkflow} first in the current task, then focus one named page target. Pass exactly one targetId value returned by discovery.`,
      inputSchema: jsonSchemas.focusDomNode,
      annotations: { readOnlyHint: false },
      execute: handlers[toolNames.focusPageElement],
    },
    {
      name: toolNames.getEditResult,
      title: "Get edit result",
      description: `Retrieve paginated changes and validation problems for an operationId returned by ${toolNames.editWorkflow} or ${toolNames.undoWorkflowEdit}.`,
      inputSchema: jsonSchemas.getEditResult,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: handlers[toolNames.getEditResult],
    },
    {
      name: toolNames.showEditResult,
      title: "Show edit result",
      description: `Use this as the final proof step after ${toolNames.editWorkflow}. Pass its operationId to bring that history entry into view and move keyboard focus to it as visible evidence for the user.`,
      inputSchema: jsonSchemas.operation,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: handlers[toolNames.showEditResult],
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
