import { expect, test } from "@playwright/test";

test("Retry receipt can be inspected and undone without automatic focus movement", async ({ page }) => {
  await page.addInitScript(() => {
    const tools: Record<string, { execute: (input: unknown) => unknown }> = {};
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool(tool: { name: string; execute: (input: unknown) => unknown }) { tools[tool.name] = tool; } } });
    (window as unknown as { __workflowTools: typeof tools }).__workflowTools = tools;
  });
  await page.goto("/");
  await expect(page.getByTestId("rf__node-fetch-orders")).toBeVisible();
  await page.evaluate(() => (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools.apply_workflow_changes.execute({
    baseRevision: 0,
    intent: "Add Retry",
    commands: [
      { type: "createNode", node: { id: "retry", type: "retry", label: "Retry", position: { x: 525, y: 245 }, properties: { attempts: 3 } } },
      { type: "replaceConnection", edgeId: "edge-fetch-save", replacement: [
        { id: "edge-fetch-retry", source: "fetch-orders", sourcePort: "success", target: "retry", targetPort: "input" },
        { id: "edge-retry-save", source: "retry", sourcePort: "success", target: "save-results", targetPort: "input" },
        { id: "edge-retry-alert", source: "retry", sourcePort: "failure", target: "alert-team", targetPort: "input" },
      ] },
    ],
  }));
  await expect(page.getByRole("status")).toContainText("Created Retry and changed 4 connections");
  const receiptHeading = page.getByRole("heading", { name: "Created Retry and changed 4 connections. Workflow validation passed." });
  await expect(receiptHeading).toBeVisible();
  const receipt = receiptHeading.locator("..");
  await receipt.getByRole("button", { name: "Reveal Retry" }).click();
  await expect(page.getByTestId("rf__node-retry")).toHaveClass(/selected/);
  await receipt.getByText("Exact changes").click();
  await expect(receipt).toContainText("fetch-orders (success) → retry (input)");
  await expect(receipt).toContainText("attempts: 3");
  await receipt.getByRole("button", { name: "Undo this change" }).click();
  await expect(page.getByRole("status")).toContainText("Undid the previous workflow change");
  await expect(receiptHeading).toBeFocused();
  await expect(page.getByTestId("rf__node-retry")).toHaveCount(0);
});
