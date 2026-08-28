import { changeHeadingId } from "../receipts/dom";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export type UiActions = {
  focusChangeEntry: (operationId: string) => Promise<{ operationId: string; focusedIn: "change-history"; visible: true }>;
};

export const browserUiActions: UiActions = {
  async focusChangeEntry(operationId) {
    let heading: HTMLElement | null = null;
    for (let attempt = 0; attempt < 30 && !heading; attempt += 1) {
      heading = document.getElementById(changeHeadingId(operationId));
      if (!heading) await nextFrame();
    }
    if (!heading) throw new Error(`Change entry ${operationId} is not available in the app UI.`);
    const entry = heading.closest("article") ?? heading;
    entry.scrollIntoView({ behavior: "instant", block: "center" });
    heading.focus({ preventScroll: true });
    await nextFrame();
    const bounds = entry.getBoundingClientRect();
    const visible = bounds.bottom > 0 && bounds.right > 0 && bounds.top < window.innerHeight && bounds.left < window.innerWidth;
    if (document.activeElement !== heading || !visible) throw new Error(`Change entry ${operationId} could not be focused in the app UI.`);
    return { operationId, focusedIn: "change-history", visible: true };
  },
};
