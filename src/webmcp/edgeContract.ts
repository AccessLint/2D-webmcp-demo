import type { WorkflowEdge } from "../graph/model";

export function toPublicWorkflowEdge(edge: WorkflowEdge) {
  return {
    id: edge.id,
    source: { nodeId: edge.source, port: edge.sourcePort },
    target: { nodeId: edge.target, port: edge.targetPort },
    ...(edge.label ? { label: edge.label } : {}),
  };
}
