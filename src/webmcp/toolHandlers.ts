import type { StoreApi } from "zustand/vanilla";
import { relationshipsForNode } from "../graph/selectors";
import { edgeReference, nodeReference } from "../graph/validation";
import type { WorkflowStore } from "../state/workflowStore";
import { applyInputSchema, emptyInputSchema, focusDomNodeInputSchema, inspectInputSchema, operationInputSchema, revealInputSchema } from "./toolSchemas";
import { browserUiActions, type UiActions } from "./uiActions";
import { selectorForUiTarget } from "./uiTargets";
import { workflowSummary } from "./discovery";
import { ToolError } from "./errors";

export function createToolHandlers(store: StoreApi<WorkflowStore>, uiActions: UiActions = browserUiActions) {
  return {
    get_workflow_summary(input: unknown) {
      emptyInputSchema.parse(input);
      store.getState().logInvocation("get_workflow_summary", "Completed");
      return workflowSummary(store.getState().workflow);
    },
    inspect_workflow_objects(input: unknown) {
      const { objects } = inspectInputSchema.parse(input);
      const state = store.getState().workflow;
      store.getState().logInvocation("inspect_workflow_objects", "Completed");
      return objects.map(({ kind, id }) => {
        if (kind === "workflow-node") {
          const node = state.nodes.find((item) => item.id === id);
          if (!node) throw new ToolError("NOT_FOUND", `Node ${id} no longer exists.`);
          return { ...node, reference: nodeReference(node), relationships: relationshipsForNode(state, id).map(({ edge, direction, other }) => ({ direction, port: direction === "outgoing" ? edge.sourcePort : edge.targetPort, other: nodeReference(other), edge: edgeReference(edge) })) };
        }
        const edge = state.edges.find((item) => item.id === id);
        if (!edge) throw new ToolError("NOT_FOUND", `Edge ${id} no longer exists.`);
        return { ...edge, reference: edgeReference(edge), sourceNode: nodeReference(state.nodes.find((node) => node.id === edge.source)!), targetNode: nodeReference(state.nodes.find((node) => node.id === edge.target)!) };
      });
    },
    apply_workflow_changes(input: unknown) {
      const parsed = applyInputSchema.parse(input);
      const receipt = store.getState().apply(parsed.baseRevision, parsed.commands, parsed.intent);
      store.getState().logInvocation("apply_workflow_changes", receipt.status === "completed" ? "Completed" : `${receipt.status} recorded`);
      return receipt;
    },
    async reveal_workflow_object(input: unknown) {
      const parsed = revealInputSchema.parse(input);
      const state = store.getState().workflow;
      const object = parsed.kind === "workflow-node" ? state.nodes.find((node) => node.id === parsed.id) : state.edges.find((edge) => edge.id === parsed.id);
      if (!object) throw new ToolError("NOT_FOUND", `${parsed.kind === "workflow-node" ? "Node" : "Edge"} ${parsed.id} no longer exists.`);
      const label = "label" in object && object.label ? object.label : object.id;
      store.getState().select({ kind: parsed.kind === "workflow-node" ? "node" : "edge", id: parsed.id }, undefined, true);
      const focusResult = parsed.kind === "workflow-node" ? await uiActions.focusWorkflowNode(parsed.id) : { focused: false as const, visible: null };
      store.getState().logInvocation("reveal_workflow_object", "Completed");
      return { kind: parsed.kind, id: parsed.id, label, revealedIn: "workflow-canvas", focused: focusResult.focused, visible: focusResult.visible };
    },
    async focus_dom_node(input: unknown) {
      const parsed = focusDomNodeInputSchema.parse(input);
      const selector = "targetId" in parsed ? selectorForUiTarget(parsed.targetId) : parsed.selector;
      const focusResult = await uiActions.focusDomNode(selector);
      store.getState().logInvocation("focus_dom_node", "Completed");
      return "targetId" in parsed ? { ...focusResult, targetId: parsed.targetId } : focusResult;
    },
    get_change_receipt(input: unknown) {
      const { operationId } = operationInputSchema.parse(input);
      const receipt = store.getState().history.find((item) => item.operationId === operationId);
      if (!receipt) throw new ToolError("NOT_FOUND", `Receipt ${operationId} does not exist.`);
      store.getState().logInvocation("get_change_receipt", "Completed");
      return receipt;
    },
    async focus_change_entry(input: unknown) {
      const { operationId } = operationInputSchema.parse(input);
      const receipt = store.getState().history.find((item) => item.operationId === operationId);
      if (!receipt) throw new ToolError("NOT_FOUND", `Receipt ${operationId} does not exist.`);
      const focusResult = await uiActions.focusChangeEntry(operationId);
      store.getState().logInvocation("focus_change_entry", "Completed");
      return { ...focusResult, summary: receipt.summary, status: receipt.status };
    },
    undo_workflow_change(input: unknown) {
      const { operationId } = operationInputSchema.parse(input);
      const receipt = store.getState().undo(operationId);
      store.getState().logInvocation("undo_workflow_change", "Completed");
      return receipt;
    },
    dispose() {
      uiActions.cancelPendingDomFocus?.();
    },
  };
}

export type ToolHandlers = ReturnType<typeof createToolHandlers>;
