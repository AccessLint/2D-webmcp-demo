export type ToolErrorCode = "NOT_FOUND" | "TOOL_EXECUTION_FAILED" | "UNDO_NOT_AVAILABLE" | "UNDO_REVISION_CONFLICT";

export class ToolError extends Error {
  constructor(readonly code: ToolErrorCode, message: string) {
    super(message);
    this.name = "ToolError";
  }
}
