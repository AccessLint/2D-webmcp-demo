import { expect, test } from "@playwright/test";

test("Retry receipt can be inspected and undone without automatic focus movement", async ({ page }) => {
  await page.goto("/");
  const runDemo = page.getByRole("button", { name: "Run Retry demo" });
  await runDemo.focus();
  await runDemo.click();
  await expect(page.getByRole("status")).toContainText("Created Retry and changed 4 connections");
  const receiptHeading = page.getByRole("heading", { name: "Created Retry and changed 4 connections. Workflow validation passed." });
  await expect(receiptHeading).toBeVisible();
  const receipt = receiptHeading.locator("..");
  await page.getByRole("button", { name: "Record stale-revision example" }).click();
  await expect(page.getByRole("heading", { name: /revision was stale/ })).toBeVisible();
  await expect(receipt.getByRole("button", { name: "Undo this change" })).toBeVisible();
  await receipt.getByRole("button", { name: "Inspect Retry" }).click();
  await expect(page.getByRole("heading", { name: "Retry node" })).toBeFocused();
  const inspector = page.getByRole("heading", { name: "Retry node" }).locator("..");
  await expect(inspector.getByText("attempts", { exact: true }).locator("..")).toContainText("3");
  await page.getByRole("button", { name: "Return to change" }).click();
  await expect(receipt.getByRole("button", { name: "Inspect Retry" })).toBeFocused();
  await receipt.getByText("Exact changes").click();
  await expect(receipt).toContainText("fetch-orders (success) → retry (input)");
  await expect(receipt).toContainText("attempts: 3");
  await receipt.getByRole("button", { name: "Undo this change" }).click();
  await expect(page.getByRole("status")).toContainText("Undid the previous workflow change");
  await expect(receiptHeading).toBeFocused();
  const outline = page.getByRole("heading", { name: "Workflow outline" }).locator("..").locator("..");
  await expect(outline.getByRole("button", { name: "Inspect Retry" })).toHaveCount(0);
});
