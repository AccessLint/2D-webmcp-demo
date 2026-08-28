import { ZodError, type ZodIssue } from "zod";
import type { ToolHandlers } from "./toolHandlers";
import { jsonSchemas } from "./toolSchemas";
import { ToolError } from "./errors";
import { toolNames } from "./toolNames";

function flattenIssues(issues: ZodIssue[]): Array<{ path: Array<string | number>; code: string; message: string }> {
  return issues.flatMap((issue) => issue.code === "invalid_union"
    ? issue.errors.flatMap((branch) => flattenIssues(branch))
    : [{
      path: issue.path.map((part) => typeof part === "symbol" ? part.description ?? String(part) : part),
      code: issue.code,
      message: issue.message,
    }]);
}

function recoveryError(error: unknown) {
  const invalidInput = error instanceof ZodError;
  const message = error instanceof Error ? error.message : "The tool could not complete the request.";
  return {
    ok: false,
    error: {
      code: invalidInput ? "INVALID_INPUT" : error instanceof ToolError ? error.code : "TOOL_EXECUTION_FAILED",
      message: invalidInput ? "The input did not match the registered schema." : message,
      ...(invalidInput ? { issues: flattenIssues(error.issues) } : {}),
      recovery: { tool: toolNames.discoverWorkflow, input: {}, reason: "Refresh valid IDs, ports, UI targets, and examples before retrying." },
    },
  };
}

const withRecovery = (execute: WebMCPTool["execute"]): WebMCPTool["execute"] => (input, options) => {
  try {
    const result = execute(input, options);
    return result instanceof Promise ? result.catch(recoveryError) : result;
  } catch (error) {
    return recoveryError(error);
  }
};

export function registerWorkflowTools(handlers: ToolHandlers) {
  if (!document.modelContext) return { supported: false, unregister: () => undefined };
  const controller = new AbortController();
  const tools: WebMCPTool[] = [
    { name: toolNames.discoverWorkflow, title: "Discover workflow", description: "Call this first, and again after any conflict. Returns the current revision, valid item IDs and ports, named page targets, validation state, and copyable next-call examples.", inputSchema: jsonSchemas.empty, annotations: { readOnlyHint: true }, execute: handlers[toolNames.discoverWorkflow] },
    { name: toolNames.inspectWorkflowItems, title: "Inspect workflow items", description: `Call after ${toolNames.discoverWorkflow} to inspect current nodes or connections by stable application ID, including properties and relationships.`, inputSchema: jsonSchemas.inspect, annotations: { readOnlyHint: true }, execute: handlers[toolNames.inspectWorkflowItems] },
    { name: toolNames.editWorkflow, title: "Edit workflow", description: `Call after ${toolNames.discoverWorkflow}. Copy its current revision into baseRevision, then atomically apply up to 20 typed commands. Returns an application-authored edit result; on conflict, follow recovery.`, inputSchema: jsonSchemas.apply, annotations: { readOnlyHint: false }, execute: handlers[toolNames.editWorkflow] },
    { name: toolNames.showWorkflowItem, title: "Show workflow item", description: `Use a current item ID from ${toolNames.discoverWorkflow} to select a workflow node or connection and bring it into view. For nodes, also moves verified keyboard focus to the node.`, inputSchema: jsonSchemas.reveal, annotations: { readOnlyHint: false }, execute: handlers[toolNames.showWorkflowItem] },
    { name: toolNames.focusPageElement, title: "Focus page element", description: `Focus a named page target or advanced CSS selector on the next browser focus or accessibility interaction. Prefer targetId values returned by ${toolNames.discoverWorkflow}; use selector only as an advanced fallback.`, inputSchema: jsonSchemas.focusDomNode, annotations: { readOnlyHint: false }, execute: handlers[toolNames.focusPageElement] },
    { name: toolNames.getEditResult, title: "Get edit result", description: `Retrieve application-authored completion evidence using an operationId returned by ${toolNames.editWorkflow} or ${toolNames.undoWorkflowEdit}.`, inputSchema: jsonSchemas.operation, annotations: { readOnlyHint: true }, execute: handlers[toolNames.getEditResult] },
    { name: toolNames.showEditResult, title: "Show edit result", description: "Use an operationId from an edit result to bring that history entry into view and move keyboard focus to it for proof or review.", inputSchema: jsonSchemas.operation, annotations: { readOnlyHint: false }, execute: handlers[toolNames.showEditResult] },
    { name: toolNames.undoWorkflowEdit, title: "Undo workflow edit", description: "Undo the operationId from a successful edit result when it is still the latest graph revision, then return a reversal result.", inputSchema: jsonSchemas.operation, annotations: { readOnlyHint: false }, execute: handlers[toolNames.undoWorkflowEdit] },
  ];
  for (const tool of tools) void document.modelContext.registerTool({ ...tool, execute: withRecovery(tool.execute) }, { signal: controller.signal });
  return { supported: true, unregister: () => { controller.abort(); handlers.dispose(); } };
}
