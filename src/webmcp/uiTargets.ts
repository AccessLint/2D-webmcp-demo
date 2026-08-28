export const uiTargets = {
  "canvas.zoom-in": { label: "Zoom In", selector: "button[aria-label='Zoom In']" },
  "canvas.zoom-out": { label: "Zoom Out", selector: "button[aria-label='Zoom Out']" },
  "canvas.fit-view": { label: "Fit View", selector: "button[aria-label='Fit View']" },
} as const;

export type UiTargetId = keyof typeof uiTargets;
export const uiTargetIds = Object.keys(uiTargets) as [UiTargetId, ...UiTargetId[]];
export const uiTargetList = uiTargetIds.map((id) => ({ id, ...uiTargets[id] }));

export function selectorForUiTarget(id: UiTargetId) {
  return uiTargets[id].selector;
}
