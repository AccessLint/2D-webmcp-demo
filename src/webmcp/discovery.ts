import type { WorkflowState } from "../graph/model";
import { toPublicWorkflowEdge } from "./edgeContract";

export function workflowSummary(state: WorkflowState) {
  return {
    revision: state.revision,
    nodes: state.nodes.length,
    edges: state.edges.length,
    authoring: {
      nodes: state.nodes.map((node) => ({ id: node.id, type: node.type, label: node.label })),
      edges: state.edges.map(toPublicWorkflowEdge),
    },
  };
}
