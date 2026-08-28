type WebMCPTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: unknown, options?: { signal: AbortSignal }) => unknown | Promise<unknown>;
};

interface ModelContext extends EventTarget {
  registerTool(tool: WebMCPTool, options?: { signal?: AbortSignal }): void | Promise<void>;
}

interface Document { modelContext?: ModelContext }
