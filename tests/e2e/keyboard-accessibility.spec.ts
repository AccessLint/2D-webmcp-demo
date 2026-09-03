import { expect, test } from "@playwright/test";

test("canvas nodes use treegrid semantics and roving arrow-key navigation", async ({ page }) => {
  await page.goto("/");

  const newNodeName = page.getByRole("textbox", { name: "New node name" });
  await newNodeName.fill("Root");
  await page.getByRole("button", { name: "Add node" }).click();
  await newNodeName.fill("Next");
  await page.getByRole("button", { name: "Add node" }).click();

  const treegrid = page.getByRole("treegrid", { name: "Workflow canvas" });
  const root = treegrid.getByRole("row", { name: "Action node: Root" });
  const next = treegrid.getByRole("row", { name: "Action node: Next" });
  await expect(treegrid).toHaveAttribute("aria-rowcount", "2");
  await expect(treegrid.locator(".react-flow__node[tabindex='0']")).toHaveCount(1);
  await expect(root.getByRole("gridcell")).toBeVisible();
  await expect(root).toHaveAttribute("tabindex", "-1");
  await expect(next).toHaveAttribute("tabindex", "0");

  const initialTransform = await root.getAttribute("style");
  await root.focus();
  await root.press("ArrowDown");
  await expect(next).toBeFocused();
  await expect(root).toHaveAttribute("style", initialTransform ?? "");
  await expect(root).toHaveAttribute("tabindex", "-1");
  await expect(next).toHaveAttribute("tabindex", "0");

  const nextTransform = await next.getAttribute("style");
  await next.press("Alt+ArrowRight");
  await expect(next).not.toHaveAttribute("style", nextTransform ?? "");

  await next.press("Tab");
  await expect(next).not.toBeFocused();
});

test("selected nodes move and cancel selection with the documented keyboard commands", async ({ page }) => {
  await page.goto("/");

  const entryNode = page.getByRole("button", { name: "Node: New lead submitted" });
  await entryNode.press("Enter");
  await expect(entryNode).toHaveClass(/selected/);

  await entryNode.press("ArrowRight");

  await expect(entryNode).toHaveCSS("transform", "matrix(1, 0, 0, 1, 45, 220)");
  await expect(page.locator("#react-flow__aria-live-1")).toHaveText("Moved selected node right.");

  await page.reload();
  await expect(entryNode).toHaveCSS("transform", "matrix(1, 0, 0, 1, 45, 220)");
  await expect(entryNode).toHaveClass(/selected/);

  await entryNode.press("Escape");
  await expect(entryNode).not.toHaveClass(/selected/);
});

test("connections are directly keyboard navigable without duplicate controls", async ({ page }) => {
  await page.goto("/");

  const newNodeName = page.getByRole("textbox", { name: "New node name" });
  await newNodeName.fill("Root");
  await page.getByRole("button", { name: "Add node" }).click();
  await newNodeName.fill("Next");
  await page.getByRole("button", { name: "Add node" }).click();
  const root = page.getByRole("row", { name: "Action node: Root" });
  const next = page.getByRole("row", { name: "Action node: Next" });
  await root.focus();
  await root.press("Control+c");
  await next.focus();
  await next.press("Control+c");

  await expect(page.getByRole("region", { name: "Workflow connections" })).toHaveCount(0);
  await expect(page.locator(".react-flow__edge[tabindex='0']")).toHaveCount(1);

  const firstConnection = page.getByRole("group", {
    name: "Connection from Root to Next: success",
  });
  await firstConnection.focus();
  await expect(firstConnection).toBeFocused();
  await expect(firstConnection.locator(".react-flow__edge-path")).toHaveCSS("stroke-width", "2.5px");

  await firstConnection.press("Enter");
  await expect(firstConnection).toHaveClass(/selected/);

  await firstConnection.press("Escape");
  await expect(firstConnection).not.toHaveClass(/selected/);

  await firstConnection.focus();
  await firstConnection.press("Space");
  await firstConnection.press("Backspace");
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
});

test("node selection is exposed as accessibility state", async ({ page }) => {
  await page.goto("/");

  const entryNode = page.getByRole("button", { name: "Node: New lead submitted" });
  const descriptionId = await entryNode.getAttribute("aria-describedby");
  expect(descriptionId).toBeTruthy();
  await expect(page.locator(`#${descriptionId}`)).toContainText("toggle selection");

  await entryNode.click();
  await expect(entryNode).toHaveAttribute("aria-pressed", "true");

  await entryNode.press("Space");
  await expect(entryNode).toHaveAttribute("aria-pressed", "false");

  await entryNode.press("Enter");
  await expect(entryNode).toHaveAttribute("aria-pressed", "true");

  await entryNode.press("Escape");
  await expect(entryNode).toHaveAttribute("aria-pressed", "false");

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
    "Tab to navigate to connections and canvas controls.",
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
