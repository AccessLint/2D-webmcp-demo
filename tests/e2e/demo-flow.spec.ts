import { expect, test, type Page } from "@playwright/test";
import { createSalesWorkflowEditCommands } from "../fixtures/salesWorkflow";

async function seedSalesWorkflow(page: Page) {
  const commands = createSalesWorkflowEditCommands();
  await page.evaluate(async (commands) => {
    const tools = (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools;
    await tools.edit_workflow.execute({
      baseRevision: 0,
      commands,
    });
  }, commands);
}

test("a WebMCP edit announces its receipt without moving focus", async ({ page }) => {
  await page.addInitScript(() => {
    const tools: Record<string, { execute: (input: unknown) => unknown }> = {};
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool(tool: { name: string; execute: (input: unknown) => unknown }) { tools[tool.name] = tool; } } });
    (window as unknown as { __workflowTools: typeof tools }).__workflowTools = tools;
  });
  await page.goto("/");
  const copyPrompt = page.getByRole("button", { name: "Copy prompt" });
  await copyPrompt.focus();

  const result = await page.evaluate(async () => {
    const tools = (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools;
    return await tools.edit_workflow.execute({
      baseRevision: 0,
      commands: [{ type: "createNode", node: { id: "draft", type: "action", label: "Draft" } }],
    }) as { status: string };
  });

  expect(result).toMatchObject({ status: "completed" });
  const receiptHeading = page.getByRole("heading", { name: "Created Draft." });
  await expect(receiptHeading).toBeAttached();
  await expect(page.getByRole("status")).toContainText("Created Draft");
  await expect(copyPrompt).toBeFocused();
  await expect(page.getByRole("row", { name: "Action node: Draft" })).toBeVisible();
});

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
  await page.getByRole("textbox", { name: "New node name" }).fill("Enrich company");
  await page.getByRole("button", { name: "Add node" }).click();
  await page.waitForTimeout(500);
  const canvasBox = await page.locator(".canvas-shell").evaluate((element) => element.getBoundingClientRect().toJSON());
  const enrichCompany = page.getByRole("row", { name: "Action node: Enrich company" });
  const nodeBox = await enrichCompany.evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(nodeBox.x).toBeGreaterThanOrEqual(canvasBox.x);
  expect(nodeBox.x + nodeBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width);
  await expect(enrichCompany).toHaveAttribute("tabindex", "0");
  await enrichCompany.focus();
  await expect(enrichCompany).toBeFocused();
});

test("nodes can be added and renamed from the editing panel", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("combobox", { name: "Node type" }).selectOption("node");
  await page.getByRole("textbox", { name: "New node name" }).fill("Checkpoint");
  await page.getByRole("button", { name: "Add node" }).click();

  const createdNode = page.getByRole("row", { name: "Node: Checkpoint" });
  await expect(createdNode).toBeVisible();
  await expect(createdNode).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("status")).toContainText("Created Checkpoint");

  const renameInput = page.getByRole("textbox", { name: "Selected node name" });
  await expect(renameInput).toHaveValue("Checkpoint");
  await renameInput.fill("Approval checkpoint");
  await page.getByRole("button", { name: "Rename node" }).click();

  await expect(page.getByRole("row", { name: "Node: Approval checkpoint" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Renamed Checkpoint to Approval checkpoint",
  );
});

test("inferred recovery-route receipt can be focused, spot checked, and undone", async ({ page }) => {
  await page.addInitScript(() => {
    const tools: Record<string, { execute: (input: unknown) => unknown }> = {};
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool(tool: { name: string; execute: (input: unknown) => unknown }) { tools[tool.name] = tool; } } });
    (window as unknown as { __workflowTools: typeof tools }).__workflowTools = tools;
  });
  await page.goto("/");
  await seedSalesWorkflow(page);
  await expect(page.getByTestId("rf__node-enrich-company")).toBeVisible();
  await page.locator(".canvas-shell").evaluate((element) => { (element as HTMLElement).style.height = "1200px"; });
  const viewport = page.viewportSize()!;
  const historyBox = await page.getByRole("heading", { name: "Most recent change" }).evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(historyBox.top).toBeGreaterThan(viewport.height);
  await page.evaluate(async () => {
    const tools = (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools;
    const receipt = await tools.edit_workflow.execute({
      baseRevision: 1,
      intent: "Keep leads from disappearing when enrichment is unavailable",
      commands: [
        { type: "connect", edge: { id: "edge-enrich-review", source: { nodeId: "enrich-company", port: "failure" }, target: { nodeId: "manual-review", port: "input" }, label: "Enrichment unavailable" } },
      ],
    }) as { operationId: string };
    const shown = await tools.show_edit_result.execute({ operationId: receipt.operationId }) as { visible: boolean };
    if (!shown.visible) throw new Error("Change entry was not visible after focus.");
    return receipt.operationId;
  });
  await expect(page.getByRole("status")).toContainText("Changed 1 connection");
  const receiptHeading = page.getByRole("heading", { name: "Changed 1 connection." });
  await expect(receiptHeading).toBeVisible();
  await expect(receiptHeading).toBeFocused();
  await expect(page.locator(".react-flow__edge")).toHaveCount(7);
  await expect(page.getByRole("group", { name: "Connection from Enrich company to Manual review: Enrichment unavailable" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Connection from Qualified lead? to Create CRM opportunity: Qualified" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Connection from Qualified lead? to Add to nurture campaign: Nurture" })).toBeVisible();
  await expect(page.getByText("7 nodes", { exact: true })).toBeVisible();
  const receiptBox = await receiptHeading.locator("..").evaluate((element) => element.getBoundingClientRect().toJSON());
  expect(receiptBox.bottom).toBeGreaterThan(0);
  expect(receiptBox.top).toBeLessThan(viewport.height);
  const receipt = receiptHeading.locator("..");
  const reviewNode = page.getByTestId("rf__node-manual-review");
  await expect(reviewNode).not.toHaveClass(/selected/);
  await page.evaluate(async () => {
    const tools = (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools;
    const focusResult = await tools.focus_page_element.execute({ selector: "[data-id='manual-review']" }) as { queued: boolean; focusWhen: string };
    if (!focusResult.queued || focusResult.focusWhen !== "window-focus-or-accessibility-interaction") throw new Error("Manual review focus was not queued.");
  });
  await expect(reviewNode).not.toHaveClass(/selected/);
  await expect(reviewNode).not.toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(reviewNode).toBeFocused();
  await page.waitForTimeout(400);
  await expect(reviewNode).toBeFocused();
  await page.evaluate(() => {
    window.dispatchEvent(new FocusEvent("blur"));
    (document.activeElement as HTMLElement | null)?.blur();
    window.dispatchEvent(new FocusEvent("focus"));
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    queueMicrotask(() => document.querySelector<HTMLElement>("a[href='#workspace']")?.focus());
  });
  await expect(reviewNode).toBeFocused();
  await page.evaluate(() => {
    window.dispatchEvent(new FocusEvent("blur"));
    (document.activeElement as HTMLElement | null)?.blur();
    window.dispatchEvent(new FocusEvent("focus"));
  });
  await expect(reviewNode).not.toBeFocused();
  const qualifiedNode = page.getByTestId("rf__node-qualified-lead");
  await page.evaluate(async () => {
    const tools = (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools;
    await tools.focus_page_element.execute({ selector: "[data-id='qualified-lead']" });
  });
  await page.getByRole("button", { name: "Zoom In" }).focus();
  await expect(qualifiedNode).toBeFocused();
  await page.evaluate(async () => {
    const tools = (window as unknown as { __workflowTools: Record<string, { execute: (input: unknown) => unknown }> }).__workflowTools;
    const superseded = tools.focus_page_element.execute({ selector: "#late-focus-target" }) as Promise<{ error?: { code: string } }>;
    await tools.focus_page_element.execute({ selector: "[data-id='qualified-lead']" });
    const lateTarget = document.createElement("button");
    lateTarget.id = "late-focus-target";
    document.body.append(lateTarget);
    const supersededResult = await superseded;
    lateTarget.remove();
    if (supersededResult.error?.code !== "TOOL_EXECUTION_FAILED") throw new Error("Superseded focus request did not return a structured error.");
  });
  await page.keyboard.press("ArrowRight");
  await expect(qualifiedNode).toBeFocused();
  await expect(reviewNode).not.toBeFocused();
  await expect(receipt).not.toContainText("Agent intent");
  await expect(receipt).not.toContainText("Exact changes");
  await expect(receipt).not.toContainText("Revision 0");
  await receipt.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Undid the previous workflow change");
  await expect(page.getByRole("heading", { name: /Undid the previous workflow change/ })).toBeFocused();
  await expect(receiptHeading).toHaveCount(0);
  await expect(page.locator(".react-flow__edge[data-id='edge-enrich-review']")).toHaveCount(0);
});
