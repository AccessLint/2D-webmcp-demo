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

  const observedGraphCounts = await page.evaluate(async () => {
    const tools = (window as unknown as {
      __workflowTools: Record<string, { execute: (input: unknown) => unknown }>;
    }).__workflowTools;
    const counts: Array<{ nodes: number; edges: number }> = [];
    const recordGraphCount = () => {
      const count = {
        nodes: document.querySelectorAll(".react-flow__node").length,
        edges: document.querySelectorAll(".react-flow__edge").length,
      };
      const previous = counts.at(-1);
      if (!previous || previous.nodes !== count.nodes || previous.edges !== count.edges) {
        counts.push(count);
      }
    };
    const observer = new MutationObserver(recordGraphCount);
    observer.observe(document.querySelector(".canvas-shell")!, { childList: true, subtree: true });
    recordGraphCount();

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
    recordGraphCount();
    observer.disconnect();
    return counts;
  });

  expect(observedGraphCounts).toContainEqual({ nodes: 1, edges: 0 });
  expect(observedGraphCounts).toContainEqual({ nodes: 2, edges: 1 });
  expect(observedGraphCounts).toContainEqual({ nodes: 3, edges: 2 });
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
});

test("a connection-only edit appears without reloading the canvas", async ({ page }) => {
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

  await page.evaluate(async () => {
    const registeredTools = (window as unknown as {
      __workflowTools: Record<string, { execute: (input: unknown) => unknown }>;
    }).__workflowTools;
    await registeredTools.edit_workflow.execute({
      baseRevision: 0,
      commands: [
        { type: "createNode", node: { id: "source", type: "start", label: "Source" } },
        { type: "createNode", node: { id: "target", type: "end", label: "Target" } },
      ],
    });
  });
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);

  await page.evaluate(async () => {
    const registeredTools = (window as unknown as {
      __workflowTools: Record<string, { execute: (input: unknown) => unknown }>;
    }).__workflowTools;
    await registeredTools.edit_workflow.execute({
      baseRevision: 1,
      commands: [{
        type: "connect",
        edge: {
          id: "source-target",
          source: { nodeId: "source", port: "next" },
          target: { nodeId: "target", port: "input" },
        },
      }],
    });
  });

  const edge = page.locator('.react-flow__edge[data-id="source-target"]');
  await expect(edge).toHaveCount(1);
  await expect(edge).toHaveAttribute("aria-label", "Connection from Source to Target: next");
});
