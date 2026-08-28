import type { ApplicationReference, WorkflowEdge, WorkflowNode, WorkflowState } from "./model";
import { nodeDefinitions } from "./nodeTypes";

export type ValidationProblem = {
  code: string;
  severity: "error" | "warning";
  message: string;
  target?: ApplicationReference;
};

export type ValidationResult = { valid: boolean; problems: ValidationProblem[] };

export const nodeReference = (node: WorkflowNode): ApplicationReference => ({
  kind: "workflow-node",
  id: node.id,
  label: node.label,
  href: `#inspect-node-${encodeURIComponent(node.id)}`,
});

export const edgeReference = (edge: WorkflowEdge): ApplicationReference => ({
  kind: "workflow-edge",
  id: edge.id,
  label: edge.label ?? edge.id,
  href: `#inspect-edge-${encodeURIComponent(edge.id)}`,
});

export function validateWorkflow(state: WorkflowState): ValidationResult {
  const problems: ValidationProblem[] = [];
  const nodes = new Map(state.nodes.map((node) => [node.id, node]));
  const push = (code: string, severity: "error" | "warning", message: string, target?: ApplicationReference) =>
    problems.push({ code, severity, message, target });

  for (const edge of state.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) {
      push("MISSING_EDGE_ENDPOINT", "error", `${edge.id} has a missing endpoint.`, edgeReference(edge));
      continue;
    }
    if (!nodeDefinitions[source.type].outputs.includes(edge.sourcePort)) {
      push("UNKNOWN_SOURCE_PORT", "error", `${source.label} has no ${edge.sourcePort} output.`, nodeReference(source));
    }
    if (!nodeDefinitions[target.type].inputs.includes(edge.targetPort)) {
      push("UNKNOWN_TARGET_PORT", "error", `${target.label} has no ${edge.targetPort} input.`, nodeReference(target));
    }
  }

  const starts = state.nodes.filter((node) => node.type === "start");
  const ends = state.nodes.filter((node) => node.type === "end");
  if (starts.length === 0) push("MISSING_START", "error", "Workflow must contain a Start node.");
  if (ends.length === 0) push("MISSING_END", "error", "Workflow must contain an End node.");

  for (const node of state.nodes) {
    const incoming = state.edges.filter((edge) => edge.target === node.id);
    const outgoing = state.edges.filter((edge) => edge.source === node.id);
    if (node.type === "start" && incoming.length) push("START_HAS_INPUT", "error", `${node.label} cannot have incoming connections.`, nodeReference(node));
    if (node.type === "end" && outgoing.length) push("END_HAS_OUTPUT", "error", `${node.label} cannot have outgoing connections.`, nodeReference(node));
    for (const port of nodeDefinitions[node.type].requiredInputs) {
      if (!incoming.some((edge) => edge.targetPort === port)) push("UNCONNECTED_REQUIRED_INPUT", "warning", `${node.label} has no connection to its ${port} input.`, nodeReference(node));
    }
    for (const port of nodeDefinitions[node.type].requiredOutputs) {
      if (!outgoing.some((edge) => edge.sourcePort === port)) {
        const code = node.type === "retry" && port === "failure" ? "UNCONNECTED_FAILURE_PORT" : "UNCONNECTED_REQUIRED_OUTPUT";
        push(code, "warning", `${node.label} has no ${port} destination.`, nodeReference(node));
      }
    }
  }

  if (starts.length) {
    const reachable = new Set<string>();
    const visit = (id: string) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      state.edges.filter((edge) => edge.source === id).forEach((edge) => visit(edge.target));
    };
    starts.forEach((start) => visit(start.id));
    for (const node of state.nodes) {
      if (!reachable.has(node.id)) push("UNREACHABLE_NODE", "warning", `${node.label} is not reachable from Start.`, nodeReference(node));
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cycle = state.edges.filter((edge) => edge.source === id).some((edge) => hasCycle(edge.target));
    visiting.delete(id);
    visited.add(id);
    return cycle;
  };
  if (state.nodes.some((node) => hasCycle(node.id))) push("FORBIDDEN_CYCLE", "error", "Workflow contains a cycle.");

  return { valid: !problems.some((problem) => problem.severity === "error"), problems };
}
