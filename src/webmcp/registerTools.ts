import type { ToolHandlers } from "./toolHandlers";
import { jsonSchemas } from "./toolSchemas";

export function registerWorkflowTools(handlers: ToolHandlers) {
  if (!document.modelContext) return { supported: false, unregister: () => undefined };
  const controller = new AbortController();
  const tools = [
    { name: "get_workflow_summary", title: "Get workflow summary", description: "Read the current workflow revision, size, entry and terminal nodes, and validation state.", inputSchema: jsonSchemas.empty, annotations: { readOnlyHint: true }, execute: handlers.get_workflow_summary },
    { name: "inspect_workflow_objects", title: "Inspect workflow objects", description: "Inspect current nodes or edges by stable application ID, including their properties and semantic relationships.", inputSchema: jsonSchemas.inspect, annotations: { readOnlyHint: true }, execute: handlers.inspect_workflow_objects },
    { name: "apply_workflow_changes", title: "Apply workflow changes", description: "Atomically apply up to 20 typed workflow commands against an expected base revision and return the application's change receipt.", inputSchema: jsonSchemas.apply, annotations: { readOnlyHint: false }, execute: handlers.apply_workflow_changes },
    { name: "reveal_workflow_object", title: "Reveal workflow object", description: "Select a workflow node or edge and bring it into the canvas viewport after explicit intent.", inputSchema: jsonSchemas.reveal, annotations: { readOnlyHint: false }, execute: handlers.reveal_workflow_object },
    { name: "get_change_receipt", title: "Get change receipt", description: "Retrieve an application-authored change receipt by operation ID.", inputSchema: jsonSchemas.operation, annotations: { readOnlyHint: true }, execute: handlers.get_change_receipt },
    { name: "focus_change_entry", title: "Focus change entry", description: "Bring an application-authored change entry into view and move keyboard focus to it by operation ID, so completion evidence is visible for proof or review.", inputSchema: jsonSchemas.operation, annotations: { readOnlyHint: false }, execute: handlers.focus_change_entry },
    { name: "undo_workflow_change", title: "Undo workflow change", description: "Undo a workflow transaction when it is still the latest graph revision and return a reversal receipt.", inputSchema: jsonSchemas.operation, annotations: { readOnlyHint: false }, execute: handlers.undo_workflow_change },
  ];
  for (const tool of tools) void document.modelContext.registerTool(tool, { signal: controller.signal });
  return { supported: true, unregister: () => controller.abort() };
}
