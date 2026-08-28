import type { ApplicationReference, WorkflowEdge, WorkflowState } from "./model";
import { nodeDefinitions } from "./nodeTypes";
import { edgeReference, nodeReference } from "./references";

export type ValidationProblem = {
  code: string;
  severity: "error" | "warning";
  message: string;
  target?: ApplicationReference;
};

export type ValidationResult = { valid: boolean; problems: ValidationProblem[] };

type WorkflowIndex = {
  nodesById: Map<string, WorkflowState["nodes"][number]>;
  incomingByNode: Map<string, WorkflowEdge[]>;
  outgoingByNode: Map<string, WorkflowEdge[]>;
};

function indexWorkflow(state: WorkflowState): WorkflowIndex {
  const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
  const incomingByNode = new Map<string, WorkflowEdge[]>();
  const outgoingByNode = new Map<string, WorkflowEdge[]>();

  for (const edge of state.edges) {
    incomingByNode.set(edge.target, [...(incomingByNode.get(edge.target) ?? []), edge]);
    outgoingByNode.set(edge.source, [...(outgoingByNode.get(edge.source) ?? []), edge]);
  }

  return { nodesById, incomingByNode, outgoingByNode };
}

export function validateWorkflow(state: WorkflowState): ValidationResult {
  const problems: ValidationProblem[] = [];
  const { nodesById, incomingByNode, outgoingByNode } = indexWorkflow(state);
  const addProblem = (
    code: string,
    severity: ValidationProblem["severity"],
    message: string,
    target?: ApplicationReference,
  ) => problems.push({ code, severity, message, target });

  for (const edge of state.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      addProblem("MISSING_EDGE_ENDPOINT", "error", `${edge.id} has a missing endpoint.`, edgeReference(edge));
      continue;
    }
    if (!nodeDefinitions[source.type].outputs.includes(edge.sourcePort)) {
      addProblem("UNKNOWN_SOURCE_PORT", "error", `${source.label} has no ${edge.sourcePort} output.`, nodeReference(source));
    }
    if (!nodeDefinitions[target.type].inputs.includes(edge.targetPort)) {
      addProblem("UNKNOWN_TARGET_PORT", "error", `${target.label} has no ${edge.targetPort} input.`, nodeReference(target));
    }
  }

  const starts = state.nodes.filter((node) => node.type === "start");
  const ends = state.nodes.filter((node) => node.type === "end");
  if (starts.length === 0) addProblem("MISSING_START", "error", "Workflow must contain a Start node.");
  if (ends.length === 0) addProblem("MISSING_END", "error", "Workflow must contain an End node.");

  for (const node of state.nodes) {
    const incoming = incomingByNode.get(node.id) ?? [];
    const outgoing = outgoingByNode.get(node.id) ?? [];
    if (node.type === "start" && incoming.length) {
      addProblem("START_HAS_INPUT", "error", `${node.label} cannot have incoming connections.`, nodeReference(node));
    }
    if (node.type === "end" && outgoing.length) {
      addProblem("END_HAS_OUTPUT", "error", `${node.label} cannot have outgoing connections.`, nodeReference(node));
    }
    for (const port of nodeDefinitions[node.type].requiredInputs) {
      if (!incoming.some((edge) => edge.targetPort === port)) {
        addProblem("UNCONNECTED_REQUIRED_INPUT", "warning", `${node.label} has no connection to its ${port} input.`, nodeReference(node));
      }
    }
    for (const port of nodeDefinitions[node.type].requiredOutputs) {
      if (!outgoing.some((edge) => edge.sourcePort === port)) {
        const code = node.type === "retry" && port === "failure" ? "UNCONNECTED_FAILURE_PORT" : "UNCONNECTED_REQUIRED_OUTPUT";
        addProblem(code, "warning", `${node.label} has no ${port} destination.`, nodeReference(node));
      }
    }
  }

  if (starts.length) {
    const reachable = new Set<string>();
    const visit = (id: string) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      for (const edge of outgoingByNode.get(id) ?? []) visit(edge.target);
    };
    starts.forEach((start) => visit(start.id));
    for (const node of state.nodes) {
      if (!reachable.has(node.id)) {
        addProblem("UNREACHABLE_NODE", "warning", `${node.label} is not reachable from Start.`, nodeReference(node));
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cycle = (outgoingByNode.get(id) ?? []).some((edge) => hasCycle(edge.target));
    visiting.delete(id);
    visited.add(id);
    return cycle;
  };
  if (state.nodes.some((node) => hasCycle(node.id))) {
    addProblem("FORBIDDEN_CYCLE", "error", "Workflow contains a cycle.");
  }

  return { valid: !problems.some((problem) => problem.severity === "error"), problems };
}
