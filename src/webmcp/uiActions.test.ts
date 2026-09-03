import { describe, expect, it, vi } from "vitest";
import { changeHeadingId } from "../receipts/dom";
import { browserUiActions } from "./uiActions";

describe("browser UI actions", () => {
  it("focuses a receipt that renders after the initial thirty-frame window", async () => {
    const operationId = "delayed-receipt";
    let frame = 0;
    const insertAfterFrames = () => {
      requestAnimationFrame(() => {
        frame += 1;
        if (frame < 45) {
          insertAfterFrames();
          return;
        }
        const entry = document.createElement("article");
        entry.scrollIntoView = vi.fn();
        entry.getBoundingClientRect = () => new DOMRect(10, 10, 200, 80);
        const heading = document.createElement("h3");
        heading.id = changeHeadingId(operationId);
        heading.tabIndex = -1;
        entry.append(heading);
        document.body.append(entry);
      });
    };
    insertAfterFrames();

    await expect(browserUiActions.focusChangeEntry(operationId)).resolves.toEqual({
      operationId,
      focusedIn: "change-history",
      visible: true,
    });
  });
});
