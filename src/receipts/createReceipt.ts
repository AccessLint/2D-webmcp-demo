import type { WorkflowState } from "../graph/model";
import { edgeReference, nodeReference, type ValidationResult } from "../graph/validation";
import { summarizeChanges } from "./summarizeReceipt";
import type { ChangeReceipt, WorkflowChange } from "./schema";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffWorkflow(before: WorkflowState, after: WorkflowState, restored = false): WorkflowChange[] {
  const changes: WorkflowChange[] = [];
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
  for (const node of after.nodes) {
    const previous = beforeNodes.get(node.id);
    if (!previous) changes.push({ action: restored ? "restored" : "created", object: nodeReference(node), after: node });
    else if (!equal(previous, node)) changes.push({ action: "updated", object: nodeReference(node), before: previous, after: node });
  }
  for (const node of before.nodes) if (!afterNodes.has(node.id)) changes.push({ action: "deleted", object: nodeReference(node), before: node });
  for (const edge of after.edges) {
    const previous = beforeEdges.get(edge.id);
    if (!previous) changes.push({ action: restored ? "restored" : "connected", object: edgeReference(edge), after: edge });
    else if (!equal(previous, edge)) changes.push({ action: "updated", object: edgeReference(edge), before: previous, after: edge });
  }
  for (const edge of before.edges) if (!afterEdges.has(edge.id)) changes.push({ action: "disconnected", object: edgeReference(edge), before: edge });
  return changes;
}

export function createReceipt(input: {
  before: WorkflowState;
  after: WorkflowState;
  validation: ValidationResult;
  operationId?: string;
  intent?: string;
  undo?: boolean;
}): ChangeReceipt {
  const changes = diffWorkflow(input.before, input.after, input.undo);
  const operationId = input.operationId ?? crypto.randomUUID();
  return {
    schemaVersion: "0.1",
    operationId,
    timestamp: new Date().toISOString(),
    baseRevision: input.before.revision,
    resultingRevision: input.after.revision,
    status: "completed",
    summary: summarizeChanges(changes, input.validation.valid, input.undo),
    intent: input.intent,
    affected: changes.map((change) => change.object).filter((reference, index, all) => all.findIndex((item) => item.kind === reference.kind && item.id === reference.id) === index),
    changes,
    validation: input.validation,
    warnings: input.validation.problems.filter((problem) => problem.severity === "warning"),
    undo: { available: !input.undo, operationId: !input.undo ? operationId : undefined },
  };
}
