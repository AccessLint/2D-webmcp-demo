import { ZodError, type ZodIssue } from "zod";
import type { ToolHandlers } from "./toolHandlers";
import { jsonSchemas } from "./toolSchemas";
import { ToolError } from "./errors";

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
      recovery: { tool: "get_workflow_summary", input: {}, reason: "Refresh valid IDs, ports, UI targets, and examples before retrying." },
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
    { name: "get_workflow_summary", title: "Get workflow summary", description: "Call this first, and again after any conflict. Returns the current revision, valid object IDs and ports, semantic UI targets, validation state, and copyable next-call examples.", inputSchema: jsonSchemas.empty, annotations: { readOnlyHint: true }, execute: handlers.get_workflow_summary },
    { name: "inspect_workflow_objects", title: "Inspect workflow objects", description: "Call after get_workflow_summary to inspect current nodes or edges by stable application ID, including properties and semantic relationships.", inputSchema: jsonSchemas.inspect, annotations: { readOnlyHint: true }, execute: handlers.inspect_workflow_objects },
    { name: "apply_workflow_changes", title: "Apply workflow changes", description: "Call after get_workflow_summary. Copy its current revision into baseRevision, then atomically apply up to 20 typed commands. Returns an application-authored receipt; on conflict, follow recovery.", inputSchema: jsonSchemas.apply, annotations: { readOnlyHint: false }, execute: handlers.apply_workflow_changes },
    { name: "reveal_workflow_object", title: "Reveal workflow object", description: "Use a current object ID from get_workflow_summary to select a workflow node or edge and bring it into view. For nodes, also moves verified keyboard focus to the node.", inputSchema: jsonSchemas.reveal, annotations: { readOnlyHint: false }, execute: handlers.reveal_workflow_object },
    { name: "focus_dom_node", title: "Focus DOM node", description: "Focus a named UI target or advanced CSS selector on the next browser focus or accessibility interaction. Prefer targetId values returned by get_workflow_summary; use selector only as an advanced fallback.", inputSchema: jsonSchemas.focusDomNode, annotations: { readOnlyHint: false }, execute: handlers.focus_dom_node },
    { name: "get_change_receipt", title: "Get change receipt", description: "Retrieve application-authored completion evidence using an operationId returned by apply_workflow_changes or undo_workflow_change.", inputSchema: jsonSchemas.operation, annotations: { readOnlyHint: true }, execute: handlers.get_change_receipt },
    { name: "focus_change_entry", title: "Focus change entry", description: "Use an operationId from a change receipt to bring that history entry into view and move keyboard focus to it for proof or review.", inputSchema: jsonSchemas.operation, annotations: { readOnlyHint: false }, execute: handlers.focus_change_entry },
    { name: "undo_workflow_change", title: "Undo workflow change", description: "Undo the operationId from a successful change receipt when it is still the latest graph revision, then return a reversal receipt.", inputSchema: jsonSchemas.operation, annotations: { readOnlyHint: false }, execute: handlers.undo_workflow_change },
  ];
  for (const tool of tools) void document.modelContext.registerTool({ ...tool, execute: withRecovery(tool.execute) }, { signal: controller.signal });
  return { supported: true, unregister: () => { controller.abort(); handlers.dispose(); } };
}
