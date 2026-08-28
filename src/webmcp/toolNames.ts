export const toolNames = {
  discoverWorkflow: "discover_workflow",
  inspectWorkflowItems: "inspect_workflow_items",
  editWorkflow: "edit_workflow",
  showWorkflowItem: "show_workflow_item",
  focusPageElement: "focus_page_element",
  getEditResult: "get_edit_result",
  showEditResult: "show_edit_result",
  undoWorkflowEdit: "undo_workflow_edit",
} as const;

export type ToolName = typeof toolNames[keyof typeof toolNames];
