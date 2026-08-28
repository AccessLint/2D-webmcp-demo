import type { WorkflowState } from "./model";

export const createSeedWorkflow = (): WorkflowState => ({
  revision: 0,
  nodes: [
    { id: "start", type: "start", label: "Order received", position: { x: 40, y: 180 }, properties: {} },
    { id: "fetch-orders", type: "action", label: "Fetch Orders", position: { x: 280, y: 180 }, properties: { system: "Orders API" } },
    { id: "save-results", type: "action", label: "Save Results", position: { x: 540, y: 100 }, properties: { destination: "Warehouse" } },
    { id: "alert-team", type: "action", label: "Alert Team", position: { x: 540, y: 300 }, properties: { channel: "Operations" } },
    { id: "complete", type: "end", label: "Complete", position: { x: 800, y: 180 }, properties: {} },
  ],
  edges: [
    { id: "edge-start-fetch", source: "start", sourcePort: "next", target: "fetch-orders", targetPort: "input" },
    { id: "edge-fetch-save", source: "fetch-orders", sourcePort: "success", target: "save-results", targetPort: "input" },
    { id: "edge-save-end", source: "save-results", sourcePort: "success", target: "complete", targetPort: "input" },
  ],
});
