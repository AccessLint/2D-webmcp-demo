export type ToolErrorCode = "NOT_FOUND" | "TOOL_EXECUTION_FAILED";

export class ToolError extends Error {
  constructor(readonly code: ToolErrorCode, message: string) {
    super(message);
    this.name = "ToolError";
  }
}
