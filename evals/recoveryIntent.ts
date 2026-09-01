import type { WorkflowEdge, WorkflowNode, WorkflowState } from "../src/graph/model";

export type RecoveryIntentChecks = {
  enrichmentFailureIsHandled: boolean;
  existingNodesArePreserved: boolean;
  existingConnectionsArePreserved: boolean;
  noUnrelatedNodesWereAdded: boolean;
  noUnrelatedConnectionsWereAdded: boolean;
  editEvidenceWasShown: boolean;
};

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function isSalesOperationsStep(node: WorkflowNode | undefined): boolean {
  return Boolean(
    node
      && node.type === "action"
      && node.properties.queue === "Sales operations",
  );
}

function isRecoveryConnection(edge: WorkflowEdge, nodes: Map<string, WorkflowNode>): boolean {
  return edge.source === "enrich-company"
    && edge.sourcePort === "failure"
    && edge.targetPort === "input"
    && isSalesOperationsStep(nodes.get(edge.target));
}

export function evaluateRecoveryIntent(
  before: WorkflowState,
  after: WorkflowState,
  editEvidenceWasShown: boolean,
): { passed: boolean; checks: RecoveryIntentChecks } {
  const beforeNodeIds = new Set(before.nodes.map((node) => node.id));
  const beforeEdgeIds = new Set(before.edges.map((edge) => edge.id));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const addedNodes = after.nodes.filter((node) => !beforeNodeIds.has(node.id));
  const addedConnections = after.edges.filter((edge) => !beforeEdgeIds.has(edge.id));
  const recoveryConnections = addedConnections.filter((edge) => isRecoveryConnection(edge, afterNodes));

  const checks: RecoveryIntentChecks = {
    enrichmentFailureIsHandled: recoveryConnections.length === 1,
    existingNodesArePreserved: before.nodes.every((node) => equal(afterNodes.get(node.id), node)),
    existingConnectionsArePreserved: before.edges.every((edge) => (
      after.edges.some((candidate) => candidate.id === edge.id && equal(candidate, edge))
    )),
    noUnrelatedNodesWereAdded: addedNodes.length === 0
      || (addedNodes.length === 1 && isSalesOperationsStep(addedNodes[0]) && recoveryConnections[0]?.target === addedNodes[0].id),
    noUnrelatedConnectionsWereAdded: addedConnections.length === 1 && recoveryConnections.length === 1,
    editEvidenceWasShown,
  };

  return { passed: Object.values(checks).every(Boolean), checks };
}
