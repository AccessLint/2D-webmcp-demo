import type { WorkflowEdge, WorkflowNode, WorkflowState } from "./model";
import { nodeDefinitions } from "./nodeTypes";

export const MAX_COMMANDS_PER_BATCH = 100;

export type WorkflowCommand =
  | { type: "createNode"; node: WorkflowNode }
  | { type: "updateNode"; id: string; patch: Partial<WorkflowNode> }
  | { type: "deleteNode"; id: string }
  | { type: "connect"; edge: WorkflowEdge }
  | { type: "disconnect"; edgeId: string }
  | { type: "replaceConnection"; edgeId: string; replacement: WorkflowEdge[] };

type BatchInput = { baseRevision: number; commands: WorkflowCommand[] };
type BatchSuccess = { ok: true; state: WorkflowState };
export type BatchFailureCode =
  | "REVISION_CONFLICT"
  | "INVALID_COMMAND"
  | "NOT_FOUND"
  | "ALREADY_EXISTS";
type BatchFailure = { ok: false; status: "failed" | "conflict"; code: BatchFailureCode; message: string };
export type BatchResult = BatchSuccess | BatchFailure;

class WorkflowCommandError extends Error {
  constructor(
    readonly code: Extract<BatchFailureCode, "INVALID_COMMAND" | "NOT_FOUND" | "ALREADY_EXISTS">,
    message: string,
  ) {
    super(message);
    this.name = "WorkflowCommandError";
  }
}

function failedBatch(code: BatchFailureCode, message: string): BatchFailure {
  return { ok: false, status: code === "REVISION_CONFLICT" ? "conflict" : "failed", code, message };
}

export function executeBatch(state: WorkflowState, input: BatchInput): BatchResult {
  if (input.baseRevision !== state.revision) {
    return failedBatch(
      "REVISION_CONFLICT",
      `Expected revision ${state.revision}, received ${input.baseRevision}.`,
    );
  }
  if (input.commands.length === 0 || input.commands.length > MAX_COMMANDS_PER_BATCH) {
    return failedBatch(
      "INVALID_COMMAND",
      `A transaction must contain between 1 and ${MAX_COMMANDS_PER_BATCH} commands.`,
    );
  }

  const draft = structuredClone(state);
  try {
    for (const command of input.commands) {
      applyCommand(draft, command);
    }
  } catch (error) {
    return failedBatch(
      error instanceof WorkflowCommandError ? error.code : "INVALID_COMMAND",
      error instanceof Error ? error.message : "Invalid workflow command.",
    );
  }

  draft.revision = state.revision + 1;
  return { ok: true, state: draft };
}

function findNode(state: WorkflowState, id: string) {
  return state.nodes.find((node) => node.id === id);
}

function findEdge(state: WorkflowState, id: string) {
  return state.edges.find((edge) => edge.id === id);
}

function assertNodeType(node: WorkflowNode) {
  if (!nodeDefinitions[node.type]) {
    throw new WorkflowCommandError("INVALID_COMMAND", `Unknown node type ${String(node.type)}.`);
  }
}

function addEdge(state: WorkflowState, edge: WorkflowEdge) {
  assertEdgeEndpointsAndPorts(state, edge);
  if (findEdge(state, edge.id)) {
    throw new WorkflowCommandError("ALREADY_EXISTS", `Edge ID ${edge.id} already exists.`);
  }
  state.edges.push(structuredClone(edge));
}

function applyCommand(state: WorkflowState, command: WorkflowCommand): void {
  switch (command.type) {
    case "createNode": {
      if (findNode(state, command.node.id)) {
        throw new WorkflowCommandError("ALREADY_EXISTS", `Node ID ${command.node.id} already exists.`);
      }
      assertNodeType(command.node);
      state.nodes.push(structuredClone(command.node));
      return;
    }
    case "updateNode": {
      const index = state.nodes.findIndex((node) => node.id === command.id);
      if (index < 0) {
        throw new WorkflowCommandError("NOT_FOUND", `Node ${command.id} does not exist.`);
      }
      const updatedNode = {
        ...state.nodes[index],
        ...structuredClone(command.patch),
        id: command.id,
      } as WorkflowNode;
      assertNodeType(updatedNode);
      state.nodes[index] = updatedNode;
      return;
    }
    case "deleteNode": {
      if (!findNode(state, command.id)) {
        throw new WorkflowCommandError("NOT_FOUND", `Node ${command.id} does not exist.`);
      }
      state.nodes = state.nodes.filter((node) => node.id !== command.id);
      state.edges = state.edges.filter((edge) => edge.source !== command.id && edge.target !== command.id);
      return;
    }
    case "connect":
      addEdge(state, command.edge);
      return;
    case "disconnect": {
      if (!findEdge(state, command.edgeId)) {
        throw new WorkflowCommandError("NOT_FOUND", `Edge ${command.edgeId} does not exist.`);
      }
      state.edges = state.edges.filter((edge) => edge.id !== command.edgeId);
      return;
    }
    case "replaceConnection": {
      if (!findEdge(state, command.edgeId)) {
        throw new WorkflowCommandError("NOT_FOUND", `Edge ${command.edgeId} does not exist.`);
      }
      state.edges = state.edges.filter((edge) => edge.id !== command.edgeId);
      for (const edge of command.replacement) {
        addEdge(state, edge);
      }
    }
  }
}

function assertEdgeEndpointsAndPorts(state: WorkflowState, edge: WorkflowEdge) {
  const source = findNode(state, edge.source);
  const target = findNode(state, edge.target);
  if (!source || !target) {
    throw new WorkflowCommandError("NOT_FOUND", `Edge ${edge.id} has a missing endpoint.`);
  }
  if (!nodeDefinitions[source.type].outputs.includes(edge.sourcePort)) {
    throw new WorkflowCommandError("INVALID_COMMAND", `${source.label} has no ${edge.sourcePort} output.`);
  }
  if (!nodeDefinitions[target.type].inputs.includes(edge.targetPort)) {
    throw new WorkflowCommandError("INVALID_COMMAND", `${target.label} has no ${edge.targetPort} input.`);
  }
}
