import { expect, test } from "@playwright/test";

test("canvas refits after becoming measurable", async ({ page }) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const shell = document.querySelector<HTMLElement>(".canvas-shell");
      if (!shell || shell.dataset.measurementProbe) return;
      shell.dataset.measurementProbe = "true";
      shell.style.display = "none";
      setTimeout(() => { shell.style.display = "block"; }, 250);
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await page.waitForTimeout(500);
  const canvasBox = await page.locator(".canvas-shell").evaluate((element) => element.getBoundingClientRect().toJSON());
  const nodeBox = await page.getByTestId("rf__node-fetch-orders").evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(nodeBox.x).toBeGreaterThanOrEqual(canvasBox.x);
  expect(nodeBox.x + nodeBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width);
  const fetchOrders = page.getByRole("button", { name: "Action node: Fetch Orders" });
  await expect(fetchOrders).toHaveAttribute("tabindex", "0");
  await fetchOrders.focus();
  await expect(fetchOrders).toBeFocused();
});

test("Retry receipt can be focused, spot checked, and undone", async ({ page }) => {
  await page.addInitScript(() => {
    const tools: Record<string, { execute: (input: unknown) => unknown }> = {};
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool(tool: { name: string; execute: (input: unknown) => unknown }) { tools[tool.name] = tool; } } });
    (window as unknown as { __workflowTools: typeof tools }).__workflowTools = tools;
  });
  await page.goto("/");
  await expect(page.getByTestId("rf__node-fetch-orders")).toBeVisible();
  await page.locator(".canvas-shell").evaluate((element) => { (element as HTMLElement).style.height = "1200px"; });
  const viewport = page.viewportSize()!;
  const historyBox = await page.getByRole("heading", { name: "Most recent change" }).evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(historyBox.top).toBeGreaterThan(viewport.height);
  await page.evaluate(async () => {
    const tools = (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools;
    const receipt = tools.edit_workflow.execute({
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
    }) as { operationId: string };
    const focusResult = await tools.show_edit_result.execute({ operationId: receipt.operationId }) as { visible: boolean };
    if (!focusResult.visible) throw new Error("Change entry was not visible after focus.");
    return receipt.operationId;
  });
  await expect(page.getByRole("status")).toContainText("Created Retry and changed 4 connections");
  const receiptHeading = page.getByRole("heading", { name: "Created Retry and changed 4 connections. Workflow validation passed." });
  await expect(receiptHeading).toBeVisible();
  await expect(receiptHeading).toBeFocused();
  const receiptBox = await receiptHeading.locator("..").evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(receiptBox.bottom).toBeGreaterThan(0);
  expect(receiptBox.top).toBeLessThan(viewport.height);
  const receipt = receiptHeading.locator("..");
  const retryNode = page.getByTestId("rf__node-retry");
  await expect(retryNode).not.toHaveClass(/selected/);
  await page.evaluate(async () => {
    const tools = (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools;
    const focusResult = await tools.focus_page_element.execute({ selector: "[data-id='retry']" }) as { queued: boolean; focusWhen: string };
    if (!focusResult.queued || focusResult.focusWhen !== "window-focus-or-accessibility-interaction") throw new Error("Retry node focus was not queued.");
  });
  await expect(retryNode).not.toHaveClass(/selected/);
  await expect(retryNode).not.toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(retryNode).toBeFocused();
  await page.waitForTimeout(400);
  await expect(retryNode).toBeFocused();
  await page.evaluate(() => {
    window.dispatchEvent(new FocusEvent("blur"));
    (document.activeElement as HTMLElement | null)?.blur();
    window.dispatchEvent(new FocusEvent("focus"));
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    queueMicrotask(() => document.querySelector<HTMLElement>("a[href='#workspace']")?.focus());
  });
  await expect(retryNode).toBeFocused();
  await page.evaluate(() => {
    window.dispatchEvent(new FocusEvent("blur"));
    (document.activeElement as HTMLElement | null)?.blur();
    window.dispatchEvent(new FocusEvent("focus"));
  });
  await expect(retryNode).not.toBeFocused();
  const saveNode = page.getByTestId("rf__node-save-results");
  await page.evaluate(async () => {
    const tools = (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools;
    await tools.focus_page_element.execute({ selector: "[data-id='save-results']" });
  });
  await page.getByRole("button", { name: "Zoom In" }).focus();
  await expect(saveNode).toBeFocused();
  await page.evaluate(async () => {
    const tools = (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools;
    const superseded = tools.focus_page_element.execute({ selector: "#late-focus-target" }) as Promise<{ error?: { code: string } }>;
    await tools.focus_page_element.execute({ selector: "[data-id='save-results']" });
    const lateTarget = document.createElement("button");
    lateTarget.id = "late-focus-target";
    document.body.append(lateTarget);
    const supersededResult = await superseded;
    lateTarget.remove();
    if (supersededResult.error?.code !== "TOOL_EXECUTION_FAILED") throw new Error("Superseded focus request did not return a structured error.");
  });
  await page.keyboard.press("ArrowRight");
  await expect(saveNode).toBeFocused();
  await expect(retryNode).not.toBeFocused();
  await expect(receipt).not.toContainText("Agent intent");
  await expect(receipt).not.toContainText("Exact changes");
  await expect(receipt).not.toContainText("Revision 0");
  await receipt.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Undid the previous workflow change");
  await expect(page.getByRole("heading", { name: /Undid the previous workflow change/ })).toBeFocused();
  await expect(receiptHeading).toHaveCount(0);
  await expect(page.getByTestId("rf__node-retry")).toHaveCount(0);
});
