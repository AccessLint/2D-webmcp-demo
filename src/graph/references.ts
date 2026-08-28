import type { ApplicationReference, WorkflowEdge, WorkflowNode } from "./model";

export function nodeReference(node: WorkflowNode): ApplicationReference {
  return {
    kind: "workflow-node",
    id: node.id,
    label: node.label,
    href: `#inspect-node-${encodeURIComponent(node.id)}`,
  };
}

export function edgeReference(edge: WorkflowEdge): ApplicationReference {
  return {
    kind: "workflow-edge",
    id: edge.id,
    label: edge.label ?? edge.id,
    href: `#inspect-edge-${encodeURIComponent(edge.id)}`,
  };
}
