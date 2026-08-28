import { changeHeadingId } from "../receipts/dom";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const intersects = (first: DOMRect, second: DOMRect) => first.bottom > second.top && first.right > second.left && first.top < second.bottom && first.left < second.right;
const sameBounds = (first: DOMRect, second: DOMRect) => Math.abs(first.x - second.x) < .5 && Math.abs(first.y - second.y) < .5 && Math.abs(first.width - second.width) < .5 && Math.abs(first.height - second.height) < .5;

async function waitForElement(find: () => HTMLElement | null, unavailableMessage: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const element = find();
    if (element) return element;
    await nextFrame();
  }
  throw new Error(unavailableMessage);
}

async function waitForStableElement(find: () => HTMLElement | null, unsettledMessage: string) {
  let previousBounds: DOMRect | null = null;
  let stableFrames = 0;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await nextFrame();
    const element = find();
    if (!element) { previousBounds = null; stableFrames = 0; continue; }
    const bounds = element.getBoundingClientRect();
    stableFrames = previousBounds && sameBounds(previousBounds, bounds) ? stableFrames + 1 : 0;
    if (stableFrames >= 3) return element;
    previousBounds = bounds;
  }
  throw new Error(unsettledMessage);
}

export type UiActions = {
  focusChangeEntry: (operationId: string) => Promise<{ operationId: string; focusedIn: "change-history"; visible: true }>;
  focusWorkflowNode: (nodeId: string) => Promise<{ focused: true; visible: true }>;
};

export const browserUiActions: UiActions = {
  async focusChangeEntry(operationId) {
    const heading = await waitForElement(() => document.getElementById(changeHeadingId(operationId)), `Change entry ${operationId} is not available in the app UI.`);
    const entry = heading.closest("article") ?? heading;
    entry.scrollIntoView({ behavior: "instant", block: "center" });
    heading.focus({ preventScroll: true });
    await nextFrame();
    const bounds = entry.getBoundingClientRect();
    const visible = bounds.bottom > 0 && bounds.right > 0 && bounds.top < window.innerHeight && bounds.left < window.innerWidth;
    if (document.activeElement !== heading || !visible) throw new Error(`Change entry ${operationId} could not be focused in the app UI.`);
    return { operationId, focusedIn: "change-history", visible: true };
  },
  async focusWorkflowNode(nodeId) {
    const selector = `.react-flow__node.selected[data-id="${CSS.escape(nodeId)}"]`;
    const node = await waitForElement(() => document.querySelector<HTMLElement>(selector), `Selected workflow node ${nodeId} is not available in the app UI.`);
    const canvas = node.closest<HTMLElement>(".canvas-shell");
    if (!canvas) throw new Error(`Workflow canvas for node ${nodeId} is not available in the app UI.`);
    canvas.scrollIntoView({ behavior: "instant", block: "center" });
    const settledNode = await waitForStableElement(() => document.querySelector<HTMLElement>(selector), `Workflow node ${nodeId} did not settle after reveal.`);
    settledNode.focus({ preventScroll: true });
    await nextFrame();
    const nodeBounds = settledNode.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    const viewportBounds = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const visible = intersects(nodeBounds, canvasBounds) && intersects(nodeBounds, viewportBounds);
    if (document.activeElement !== settledNode || !visible) {
      const active = document.activeElement?.getAttribute("data-id") ?? document.activeElement?.tagName.toLowerCase() ?? "none";
      throw new Error(`Workflow node ${nodeId} could not be focused and revealed in the app UI (active: ${active}, visible: ${String(visible)}).`);
    }
    return { focused: true, visible: true };
  },
};
