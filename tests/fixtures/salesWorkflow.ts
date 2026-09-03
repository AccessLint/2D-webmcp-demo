import type { WorkflowState } from "../../src/graph/model";

export function createSalesWorkflow(): WorkflowState {
  return {
    revision: 0,
    nodes: [
      { id: "new-lead", type: "node", label: "New lead submitted", position: { x: 40, y: 220 }, properties: { source: "Lead form" } },
      { id: "enrich-company", type: "action", label: "Enrich company", position: { x: 280, y: 220 }, properties: { system: "Enrichment API" } },
      { id: "qualified-lead", type: "condition", label: "Qualified lead?", position: { x: 520, y: 220 }, properties: { minimumScore: 70 } },
      { id: "create-opportunity", type: "action", label: "Create CRM opportunity", position: { x: 760, y: 100 }, properties: { destination: "CRM" } },
      { id: "add-to-nurture", type: "action", label: "Add to nurture campaign", position: { x: 760, y: 300 }, properties: { destination: "Email platform" } },
      { id: "manual-review", type: "action", label: "Manual review", position: { x: 760, y: 500 }, properties: { queue: "Sales operations" } },
      { id: "complete", type: "node", label: "Complete", position: { x: 1020, y: 220 }, properties: {} },
    ],
    edges: [
      { id: "edge-lead-enrich", source: "new-lead", sourcePort: "next", target: "enrich-company", targetPort: "input" },
      { id: "edge-enrich-qualified", source: "enrich-company", sourcePort: "success", target: "qualified-lead", targetPort: "input" },
      { id: "edge-qualified-opportunity", source: "qualified-lead", sourcePort: "yes", target: "create-opportunity", targetPort: "input", label: "Qualified" },
      { id: "edge-qualified-nurture", source: "qualified-lead", sourcePort: "no", target: "add-to-nurture", targetPort: "input", label: "Nurture" },
      { id: "edge-opportunity-end", source: "create-opportunity", sourcePort: "success", target: "complete", targetPort: "input" },
      { id: "edge-nurture-end", source: "add-to-nurture", sourcePort: "success", target: "complete", targetPort: "input" },
    ],
  };
}

export function createSalesWorkflowEditCommands() {
  const workflow = createSalesWorkflow();
  return [
    ...workflow.nodes.map((node) => ({
      type: "createNode" as const,
      node: structuredClone(node),
    })),
    ...workflow.edges.map((edge) => ({
      type: "connect" as const,
      edge: {
        id: edge.id,
        source: { nodeId: edge.source, port: edge.sourcePort },
        target: { nodeId: edge.target, port: edge.targetPort },
        ...(edge.label ? { label: edge.label } : {}),
      },
    })),
  ];
}
