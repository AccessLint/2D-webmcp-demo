import { changeHeadingId } from "../receipts/dom";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const intersects = (first: DOMRect, second: DOMRect) => first.bottom > second.top && first.right > second.left && first.top < second.bottom && first.left < second.right;
const sameBounds = (first: DOMRect, second: DOMRect) => Math.abs(first.x - second.x) < .5 && Math.abs(first.y - second.y) < .5 && Math.abs(first.width - second.width) < .5 && Math.abs(first.height - second.height) < .5;
export const domFocusWhen = "window-focus-or-accessibility-interaction" as const;
let cancelPendingDomFocusRequest: (() => void) | null = null;
let domFocusRequestGeneration = 0;

async function waitForElement<ElementType extends Element>(find: () => ElementType | null, unavailableMessage: string) {
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
  focusDomNode: (selector: string) => Promise<{ selector: string; tagName: string; id: string | null; focusWhen: typeof domFocusWhen; queued: true }>;
  cancelPendingDomFocus?: () => void;
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
  async focusDomNode(selector) {
    const requestGeneration = ++domFocusRequestGeneration;
    cancelPendingDomFocusRequest?.();
    const find = () => {
      try {
        return document.querySelector(selector);
      } catch {
        throw new Error(`DOM selector ${selector} is invalid.`);
      }
    };
    const element = await waitForElement(find, `DOM node matching ${selector} is not available in the app UI.`);
    if (requestGeneration !== domFocusRequestGeneration) throw new Error(`DOM focus request for ${selector} was superseded.`);
    const focus = Reflect.get(element, "focus");
    if (typeof focus !== "function") throw new Error(`DOM node matching ${selector} cannot receive focus.`);
    let hasFocused = false;
    let focusScheduled = false;
    let restoringFocus = false;
    let restoreAfterBlur = false;
    let consumeScheduledFocus = false;
    let active = true;
    const focusElement = () => {
      if (!active) return;
      if (!element.isConnected) { cleanup(); return; }
      element.scrollIntoView({ behavior: "instant", block: "center" });
      focus.call(element, { preventScroll: true });
      if (document.activeElement !== element) {
        element.setAttribute("tabindex", "-1");
        focus.call(element, { preventScroll: true });
      }
      hasFocused = document.activeElement === element;
    };
    const queueFocus = (consume = false) => {
      restoringFocus = true;
      consumeScheduledFocus ||= consume;
      if (focusScheduled) return;
      focusScheduled = true;
      requestAnimationFrame(() => {
        focusElement();
        const shouldCleanup = consumeScheduledFocus && hasFocused;
        focusScheduled = false;
        restoringFocus = false;
        restoreAfterBlur = false;
        consumeScheduledFocus = false;
        if (shouldCleanup) cleanup();
      });
    };
    const onWindowFocus = () => queueFocus(restoreAfterBlur);
    const onWindowBlur = () => { if (hasFocused) restoreAfterBlur = true; };
    const onKeyDown = () => { if (!hasFocused) queueFocus(); };
    const onFocusIn = (event: FocusEvent) => {
      if (!hasFocused || restoringFocus) { queueFocus(); return; }
      if (event.target !== element) cleanup();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (hasFocused && !restoringFocus && event.target !== element) cleanup();
    };
    const onAssistiveClick = (event: MouseEvent) => { if (!hasFocused && event.detail === 0) queueFocus(); };
    const cleanup = () => {
      active = false;
      window.removeEventListener("focus", onWindowFocus, true);
      window.removeEventListener("blur", onWindowBlur, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onAssistiveClick, true);
      if (cancelPendingDomFocusRequest === cleanup) cancelPendingDomFocusRequest = null;
    };
    window.addEventListener("focus", onWindowFocus, true);
    window.addEventListener("blur", onWindowBlur, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onAssistiveClick, true);
    cancelPendingDomFocusRequest = cleanup;
    return { selector, tagName: element.tagName.toLowerCase(), id: element.id || null, focusWhen: domFocusWhen, queued: true };
  },
  cancelPendingDomFocus() {
    domFocusRequestGeneration += 1;
    cancelPendingDomFocusRequest?.();
  },
};
