export const toolNames = {
  discoverWorkflow: "discover_workflow",
  inspectWorkflowItems: "inspect_workflow_items",
  editWorkflow: "edit_workflow",
  showTarget: "show_target",
  undoWorkflowEdit: "undo_workflow_edit",
} as const;

export type ToolName = typeof toolNames[keyof typeof toolNames];
