import { expect, test } from "@playwright/test";

test("selected nodes move and cancel selection with the documented keyboard commands", async ({ page }) => {
  await page.goto("/");

  const startNode = page.getByRole("group", { name: "Start node: Order received" });
  await startNode.click();
  await expect(startNode).toHaveClass(/selected/);

  await startNode.press("ArrowRight");

  await expect(startNode).toHaveCSS("transform", "matrix(1, 0, 0, 1, 45, 180)");
  await expect(page.locator("#react-flow__aria-live-1")).toHaveText("Moved selected node right.");

  await startNode.press("Escape");
  await expect(startNode).not.toHaveClass(/selected/);
});
