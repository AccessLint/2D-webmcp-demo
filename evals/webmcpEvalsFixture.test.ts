import { describe, expect, it } from "vitest";
import evalCases from "./webmcp-evals.json";
import { toolNames } from "../src/webmcp/toolNames";

describe("WebMCP eval fixture", () => {
  it("contains runnable cases that reference registered workflow tools", () => {
    const registeredTools = new Set(Object.values(toolNames));

    expect(evalCases.length).toBeGreaterThan(0);
    for (const evalCase of evalCases) {
      expect(["create", "edit", "read", "interaction"]).toContain(evalCase.taskType);
      expect(evalCase.messages.some((message) => message.role === "user" && message.content.length > 0)).toBe(true);
      expect(evalCase.expectedCall.length).toBeGreaterThan(0);
      for (const call of [...(evalCase.setupCalls ?? []), ...evalCase.expectedCall]) {
        expect(registeredTools.has(call.functionName)).toBe(true);
        expect(call.arguments).toBeTypeOf("object");
      }
    }
  });
});
