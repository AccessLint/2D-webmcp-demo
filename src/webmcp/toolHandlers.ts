import type { StoreApi } from "zustand/vanilla";
import type { WorkflowEdge, WorkflowNode, WorkflowState } from "../graph/model";
import { relationshipsForNode } from "../graph/selectors";
import { edgeReference, nodeReference } from "../graph/references";
import type { WorkflowStore } from "../state/workflowStore";
import {
  applyInputSchema,
  emptyInputSchema,
  focusDomNodeInputSchema,
  inspectInputSchema,
  normalizeCommands,
  operationInputSchema,
  revealInputSchema,
} from "./toolSchemas";
import { browserUiActions, type UiActions } from "./uiActions";
import { selectorForUiTarget } from "./uiTargets";
import { workflowSummary } from "./discovery";
import { ToolError } from "./errors";
import { toolNames } from "./toolNames";

function requireNode(state: WorkflowState, id: string): WorkflowNode {
  const node = state.nodes.find((item) => item.id === id);
  if (!node) throw new ToolError("NOT_FOUND", `Node ${id} no longer exists.`);
  return node;
}

function requireEdge(state: WorkflowState, id: string): WorkflowEdge {
  const edge = state.edges.find((item) => item.id === id);
  if (!edge) throw new ToolError("NOT_FOUND", `Edge ${id} no longer exists.`);
  return edge;
}

function inspectNode(state: WorkflowState, id: string) {
  const node = requireNode(state, id);
  const relationships = relationshipsForNode(state, id).map(({ edge, direction, other }) => ({
    direction,
    port: direction === "outgoing" ? edge.sourcePort : edge.targetPort,
    other: nodeReference(other),
    edge: edgeReference(edge),
  }));
  return { ...node, reference: nodeReference(node), relationships };
}

function inspectEdge(state: WorkflowState, id: string) {
  const edge = requireEdge(state, id);
  return {
    ...edge,
    reference: edgeReference(edge),
    sourceNode: nodeReference(requireNode(state, edge.source)),
    targetNode: nodeReference(requireNode(state, edge.target)),
  };
}

export function createToolHandlers(store: StoreApi<WorkflowStore>, uiActions: UiActions = browserUiActions) {
  return {
    [toolNames.discoverWorkflow](input: unknown) {
      emptyInputSchema.parse(input);
      store.getState().logInvocation(toolNames.discoverWorkflow, "Completed");
      return workflowSummary(store.getState().workflow);
    },
    [toolNames.inspectWorkflowItems](input: unknown) {
      const { objects } = inspectInputSchema.parse(input);
      const state = store.getState().workflow;
      store.getState().logInvocation(toolNames.inspectWorkflowItems, "Completed");
      return objects.map(({ kind, id }) => kind === "workflow-node"
        ? inspectNode(state, id)
        : inspectEdge(state, id));
    },
    [toolNames.editWorkflow](input: unknown) {
      const parsed = applyInputSchema.parse(input);
      const receipt = store.getState().apply(parsed.baseRevision, normalizeCommands(parsed.commands), parsed.intent);
      store.getState().logInvocation(toolNames.editWorkflow, receipt.status === "completed" ? "Completed" : `${receipt.status} recorded`);
      return receipt;
    },
    async [toolNames.showWorkflowItem](input: unknown) {
      const parsed = revealInputSchema.parse(input);
      const state = store.getState().workflow;
      const object = parsed.kind === "workflow-node"
        ? requireNode(state, parsed.id)
        : requireEdge(state, parsed.id);
      const label = "label" in object && object.label ? object.label : object.id;
      store.getState().select(
        { kind: parsed.kind === "workflow-node" ? "node" : "edge", id: parsed.id },
        undefined,
        true,
      );
      const focusResult = parsed.kind === "workflow-node"
        ? await uiActions.focusWorkflowNode(parsed.id)
        : { focused: false as const, visible: null };
      store.getState().logInvocation(toolNames.showWorkflowItem, "Completed");
      return {
        kind: parsed.kind,
        id: parsed.id,
        label,
        revealedIn: "workflow-canvas",
        focused: focusResult.focused,
        visible: focusResult.visible,
      };
    },
    async [toolNames.focusPageElement](input: unknown) {
      const parsed = focusDomNodeInputSchema.parse(input);
      const selector = "targetId" in parsed ? selectorForUiTarget(parsed.targetId) : parsed.selector;
      const focusResult = await uiActions.focusDomNode(selector);
      store.getState().logInvocation(toolNames.focusPageElement, "Completed");
      return "targetId" in parsed ? { ...focusResult, targetId: parsed.targetId } : focusResult;
    },
    [toolNames.getEditResult](input: unknown) {
      const { operationId } = operationInputSchema.parse(input);
      const receipt = store.getState().history.find((item) => item.operationId === operationId);
      if (!receipt) throw new ToolError("NOT_FOUND", `Receipt ${operationId} does not exist.`);
      store.getState().logInvocation(toolNames.getEditResult, "Completed");
      return receipt;
    },
    async [toolNames.showEditResult](input: unknown) {
      const { operationId } = operationInputSchema.parse(input);
      const receipt = store.getState().history.find((item) => item.operationId === operationId);
      if (!receipt) throw new ToolError("NOT_FOUND", `Receipt ${operationId} does not exist.`);
      const focusResult = await uiActions.focusChangeEntry(operationId);
      store.getState().logInvocation(toolNames.showEditResult, "Completed");
      return { ...focusResult, summary: receipt.summary, status: receipt.status };
    },
    [toolNames.undoWorkflowEdit](input: unknown) {
      const { operationId } = operationInputSchema.parse(input);
      const receipt = store.getState().undo(operationId);
      store.getState().logInvocation(toolNames.undoWorkflowEdit, "Completed");
      return receipt;
    },
    dispose() {
      uiActions.cancelPendingDomFocus?.();
    },
  };
}

export type ToolHandlers = ReturnType<typeof createToolHandlers>;
