import type { ApplicationReference, WorkflowEdge, WorkflowNode, WorkflowState } from "./model";
import { edgeReference, nodeReference, validateWorkflow } from "./validation";

export type NodeRelationship = { edge: WorkflowEdge; direction: "incoming" | "outgoing"; other: WorkflowNode };

export function findObject(state: WorkflowState, kind: "workflow-node" | "workflow-edge", id: string) {
  return kind === "workflow-node" ? state.nodes.find((node) => node.id === id) : state.edges.find((edge) => edge.id === id);
}

export function relationshipsForNode(state: WorkflowState, id: string): NodeRelationship[] {
  return state.edges.flatMap<NodeRelationship>((edge) => {
    if (edge.source === id) {
      const other = state.nodes.find((node) => node.id === edge.target);
      return other ? [{ edge, direction: "outgoing", other }] : [];
    }
    if (edge.target === id) {
      const other = state.nodes.find((node) => node.id === edge.source);
      return other ? [{ edge, direction: "incoming", other }] : [];
    }
    return [];
  });
}

export function workflowSummary(state: WorkflowState) {
  const validation = validateWorkflow(state);
  return {
    revision: state.revision,
    nodes: state.nodes.length,
    edges: state.edges.length,
    entryPoints: state.nodes.filter((node) => node.type === "start").map(nodeReference),
    terminalNodes: state.nodes.filter((node) => node.type === "end").map(nodeReference),
    validation,
  };
}

export function referenceFor(state: WorkflowState, id: string): ApplicationReference | undefined {
  const node = state.nodes.find((item) => item.id === id);
  if (node) return nodeReference(node);
  const edge = state.edges.find((item) => item.id === id);
  return edge ? edgeReference(edge) : undefined;
}
