import { expect, test } from "@playwright/test";

test("selected nodes move and cancel selection with the documented keyboard commands", async ({ page }) => {
  await page.goto("/");

  const startNode = page.getByRole("button", { name: "Start node: New lead submitted" });
  await startNode.press("Enter");
  await expect(startNode).toHaveClass(/selected/);

  await startNode.press("ArrowRight");

  await expect(startNode).toHaveCSS("transform", "matrix(1, 0, 0, 1, 45, 220)");
  await expect(page.locator("#react-flow__aria-live-1")).toHaveText("Moved selected node right.");

  await page.reload();
  await expect(startNode).toHaveCSS("transform", "matrix(1, 0, 0, 1, 45, 220)");
  await expect(startNode).toHaveClass(/selected/);

  await startNode.press("Escape");
  await expect(startNode).not.toHaveClass(/selected/);
});

test("connections use named keyboard controls instead of focusable SVG edges", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".react-flow__edge[tabindex='0']")).toHaveCount(0);

  const connections = page.getByRole("region", { name: "Workflow connections" });
  await expect(connections.getByRole("button")).toHaveCount(6);

  const firstConnection = connections.getByRole("button", {
    name: /New lead submitted to Enrich company next connection/,
  });
  await firstConnection.focus();
  await expect(firstConnection).toBeFocused();
  await expect(firstConnection).toHaveCSS("outline-style", "solid");

  await firstConnection.press("Enter");
  await expect(firstConnection).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".react-flow__edge[data-id='edge-lead-enrich']")).toHaveClass(/selected/);

  await firstConnection.press("Escape");
  await expect(firstConnection).toHaveAttribute("aria-pressed", "false");

  await firstConnection.press("Space");
  await firstConnection.press("Backspace");
  await expect(connections.getByRole("button")).toHaveCount(5);
  await expect(connections.getByRole("heading", { name: "Workflow connections" })).toBeFocused();
});

test("node selection is exposed as accessibility state", async ({ page }) => {
  await page.goto("/");

  const startNode = page.getByRole("button", { name: "Start node: New lead submitted" });
  const descriptionId = await startNode.getAttribute("aria-describedby");
  expect(descriptionId).toBeTruthy();
  await expect(page.locator(`#${descriptionId}`)).toContainText("toggle selection");

  await startNode.click();
  await expect(startNode).toHaveAttribute("aria-pressed", "true");

  await startNode.press("Space");
  await expect(startNode).toHaveAttribute("aria-pressed", "false");

  await startNode.press("Enter");
  await expect(startNode).toHaveAttribute("aria-pressed", "true");

  await startNode.press("Escape");
  await expect(startNode).toHaveAttribute("aria-pressed", "false");

  const reviewNode = page.getByRole("button", { name: "Action node: Manual review" });
  await reviewNode.press("Enter");
  await reviewNode.press("Delete");
  await expect(reviewNode).toHaveCount(0);
});

test("the canvas application exposes its complete keyboard contract", async ({ page }) => {
  await page.goto("/");

  const canvas = page.getByRole("application", { name: "Workflow canvas" });
  await expect(canvas).toHaveAttribute("aria-describedby", "workflow-canvas-instructions");
  await expect(page.locator("#workflow-canvas-instructions")).toContainText(
    "Tab to a node. Press Enter or Space to toggle its selection. Use the Arrow keys to move it.",
  );
  await expect(page.locator("#workflow-canvas-instructions")).toContainText(
    "Press Escape to clear selection.",
  );
  await expect(page.locator("#workflow-canvas-instructions")).toContainText(
    "Use the Workflow connections region to review and select connections.",
  );

  const reviewNode = page.getByRole("button", { name: "Action node: Manual review" });
  await reviewNode.press("Space");
  await expect(reviewNode).toHaveAttribute("aria-pressed", "true");
  await reviewNode.press("Shift+ArrowRight");
  await expect(reviewNode).toHaveCSS("transform", "matrix(1, 0, 0, 1, 780, 500)");
  await reviewNode.press("Backspace");
  await expect(reviewNode).toHaveCount(0);
});

test("the skip link moves keyboard focus into the workflow workspace", async ({ page }) => {
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Skip to workflow workspace" });
  await skipLink.focus();
  await skipLink.press("Enter");

  await expect(page).toHaveURL(/#workspace$/);
  await expect(page.getByRole("main")).toBeFocused();
});

test("zoom controls respond to Enter and Space", async ({ page }) => {
  await page.goto("/");

  const viewport = page.locator(".react-flow__viewport");
  const initialTransform = await viewport.getAttribute("style");

  const zoomIn = page.getByRole("button", { name: "Zoom In" });
  await zoomIn.focus();
  await zoomIn.press("Enter");
  await expect(viewport).not.toHaveAttribute("style", initialTransform ?? "");

  const zoomedTransform = await viewport.getAttribute("style");
  const zoomOut = page.getByRole("button", { name: "Zoom Out" });
  await zoomOut.focus();
  await zoomOut.press("Space");
  await expect(viewport).not.toHaveAttribute("style", zoomedTransform ?? "");
});
