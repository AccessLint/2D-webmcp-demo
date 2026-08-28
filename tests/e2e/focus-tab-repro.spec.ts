import { expect, test } from "@playwright/test";

test("queued focus is not advanced by the Tab used to enter the app window", async ({ context, page }) => {
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
  const otherPage = await context.newPage();
  await otherPage.goto("about:blank");
  await otherPage.bringToFront();

  await page.evaluate(async () => {
    const tools = (window as unknown as {
      __workflowTools: Record<string, { execute: (input: unknown) => unknown }>;
    }).__workflowTools;
    await tools.focus_page_element.execute({ targetId: "canvas.zoom-in" });
  });

  await page.bringToFront();
  await page.keyboard.press("Tab");

  await expect(page.getByRole("button", { name: "Zoom In" })).toBeFocused();
});
