import type { WorkflowEdge, WorkflowNode, WorkflowState } from "./model";
import { nodeDefinitions } from "./nodeTypes";
import { validateWorkflow, type ValidationResult } from "./validation";

export type WorkflowCommand =
  | { type: "createNode"; node: WorkflowNode }
  | { type: "updateNode"; id: string; patch: Partial<WorkflowNode> }
  | { type: "deleteNode"; id: string }
  | { type: "connect"; edge: WorkflowEdge }
  | { type: "disconnect"; edgeId: string }
  | { type: "replaceConnection"; edgeId: string; replacement: WorkflowEdge[] };

type BatchInput = { baseRevision: number; commands: WorkflowCommand[] };
type BatchSuccess = { ok: true; state: WorkflowState; validation: ValidationResult };
type BatchFailure = { ok: false; status: "failed" | "conflict"; message: string };
export type BatchResult = BatchSuccess | BatchFailure;

const clone = (state: WorkflowState): WorkflowState => structuredClone(state);

export function executeBatch(state: WorkflowState, input: BatchInput): BatchResult {
  if (input.baseRevision !== state.revision) {
    return { ok: false, status: "conflict", message: `Expected revision ${state.revision}, received ${input.baseRevision}.` };
  }
  if (input.commands.length === 0 || input.commands.length > 20) {
    return { ok: false, status: "failed", message: "A transaction must contain between 1 and 20 commands." };
  }
  const draft = clone(state);
  try {
    for (const command of input.commands) applyCommand(draft, command);
  } catch (error) {
    return { ok: false, status: "failed", message: error instanceof Error ? error.message : "Invalid workflow command." };
  }
  const validation = validateWorkflow(draft);
  if (!validation.valid) {
    return { ok: false, status: "failed", message: validation.problems.filter((problem) => problem.severity === "error").map((problem) => problem.message).join(" ") };
  }
  draft.revision = state.revision + 1;
  return { ok: true, state: draft, validation };
}

function applyCommand(state: WorkflowState, command: WorkflowCommand) {
  const nodeById = (id: string) => state.nodes.find((node) => node.id === id);
  const edgeById = (id: string) => state.edges.find((edge) => edge.id === id);
  switch (command.type) {
    case "createNode":
      if (nodeById(command.node.id)) throw new Error(`Node ID ${command.node.id} already exists.`);
      if (!nodeDefinitions[command.node.type]) throw new Error(`Unknown node type ${String(command.node.type)}.`);
      state.nodes.push(structuredClone(command.node));
      return;
    case "updateNode": {
      const index = state.nodes.findIndex((node) => node.id === command.id);
      if (index < 0) throw new Error(`Node ${command.id} does not exist.`);
      const next = { ...state.nodes[index], ...structuredClone(command.patch), id: command.id } as WorkflowNode;
      if (!nodeDefinitions[next.type]) throw new Error(`Unknown node type ${String(next.type)}.`);
      state.nodes[index] = next;
      return;
    }
    case "deleteNode":
      if (!nodeById(command.id)) throw new Error(`Node ${command.id} does not exist.`);
      state.nodes = state.nodes.filter((node) => node.id !== command.id);
      state.edges = state.edges.filter((edge) => edge.source !== command.id && edge.target !== command.id);
      return;
    case "connect":
      assertEdge(state, command.edge);
      if (edgeById(command.edge.id)) throw new Error(`Edge ID ${command.edge.id} already exists.`);
      state.edges.push(structuredClone(command.edge));
      return;
    case "disconnect":
      if (!edgeById(command.edgeId)) throw new Error(`Edge ${command.edgeId} does not exist.`);
      state.edges = state.edges.filter((edge) => edge.id !== command.edgeId);
      return;
    case "replaceConnection":
      if (!edgeById(command.edgeId)) throw new Error(`Edge ${command.edgeId} does not exist.`);
      state.edges = state.edges.filter((edge) => edge.id !== command.edgeId);
      for (const edge of command.replacement) {
        assertEdge(state, edge);
        if (edgeById(edge.id)) throw new Error(`Edge ID ${edge.id} already exists.`);
        state.edges.push(structuredClone(edge));
      }
  }
}

function assertEdge(state: WorkflowState, edge: WorkflowEdge) {
  const source = state.nodes.find((node) => node.id === edge.source);
  const target = state.nodes.find((node) => node.id === edge.target);
  if (!source || !target) throw new Error(`Edge ${edge.id} has a missing endpoint.`);
  if (!nodeDefinitions[source.type].outputs.includes(edge.sourcePort)) throw new Error(`${source.label} has no ${edge.sourcePort} output.`);
  if (!nodeDefinitions[target.type].inputs.includes(edge.targetPort)) throw new Error(`${target.label} has no ${edge.targetPort} input.`);
}
