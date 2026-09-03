import { expect, test } from "@playwright/test";

test("edit_workflow reveals a new diagram one node at a time", async ({ page }) => {
  await page.addInitScript(() => {
    const tools: Record<string, { execute: (input: unknown) => unknown }> = {};
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: { name: string; execute: (input: unknown) => unknown }) {
          tools[tool.name] = tool;
        },
      },
    });
    (window as unknown as { __workflowTools: typeof tools }).__workflowTools = tools;
  });
  await page.goto("/");

  const observedNodeCounts = await page.evaluate(async () => {
    const tools = (window as unknown as {
      __workflowTools: Record<string, { execute: (input: unknown) => unknown }>;
    }).__workflowTools;
    const counts: number[] = [];
    const recordNodeCount = () => {
      const count = document.querySelectorAll(".react-flow__node").length;
      if (counts.at(-1) !== count) counts.push(count);
    };
    const observer = new MutationObserver(recordNodeCount);
    observer.observe(document.querySelector(".canvas-shell")!, { childList: true, subtree: true });
    recordNodeCount();

    await tools.edit_workflow.execute({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "start", type: "start", label: "Start" } },
        { type: "createNode", node: { id: "review", type: "action", label: "Review" } },
        { type: "createNode", node: { id: "done", type: "end", label: "Done" } },
        {
          type: "connect",
          edge: {
            id: "start-review",
            source: { nodeId: "start", port: "next" },
            target: { nodeId: "review", port: "input" },
          },
        },
        {
          type: "connect",
          edge: {
            id: "review-done",
            source: { nodeId: "review", port: "success" },
            target: { nodeId: "done", port: "input" },
          },
        },
      ],
    });
    recordNodeCount();
    observer.disconnect();
    return counts;
  });

  expect(observedNodeCounts).toContain(1);
  expect(observedNodeCounts).toContain(2);
  expect(observedNodeCounts).toContain(3);
  expect(observedNodeCounts.indexOf(1)).toBeLessThan(observedNodeCounts.indexOf(2));
  expect(observedNodeCounts.indexOf(2)).toBeLessThan(observedNodeCounts.indexOf(3));
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
});
