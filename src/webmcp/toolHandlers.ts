import type { StoreApi } from "zustand/vanilla";
import { relationshipsForNode, workflowSummary } from "../graph/selectors";
import { edgeReference, nodeReference } from "../graph/validation";
import type { WorkflowStore } from "../state/workflowStore";
import { applyInputSchema, inspectInputSchema, operationInputSchema, revealInputSchema } from "./toolSchemas";

export function createToolHandlers(store: StoreApi<WorkflowStore>) {
  return {
    get_workflow_summary(input: unknown) {
      void input;
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
          if (!node) throw new Error(`Node ${id} no longer exists.`);
          return { ...node, reference: nodeReference(node), relationships: relationshipsForNode(state, id).map(({ edge, direction, other }) => ({ direction, port: direction === "outgoing" ? edge.sourcePort : edge.targetPort, other: nodeReference(other), edge: edgeReference(edge) })) };
        }
        const edge = state.edges.find((item) => item.id === id);
        if (!edge) throw new Error(`Edge ${id} no longer exists.`);
        return { ...edge, reference: edgeReference(edge), sourceNode: nodeReference(state.nodes.find((node) => node.id === edge.source)!), targetNode: nodeReference(state.nodes.find((node) => node.id === edge.target)!) };
      });
    },
    apply_workflow_changes(input: unknown) {
      const parsed = applyInputSchema.parse(input);
      const receipt = store.getState().apply(parsed.baseRevision, parsed.commands, parsed.intent);
      store.getState().logInvocation("apply_workflow_changes", receipt.status === "completed" ? "Completed" : `${receipt.status} recorded`);
      return receipt;
    },
    reveal_workflow_object(input: unknown) {
      const parsed = revealInputSchema.parse(input);
      const state = store.getState().workflow;
      const object = parsed.kind === "workflow-node" ? state.nodes.find((node) => node.id === parsed.id) : state.edges.find((edge) => edge.id === parsed.id);
      if (!object) throw new Error(`${parsed.kind === "workflow-node" ? "Node" : "Edge"} ${parsed.id} no longer exists.`);
      const label = "label" in object && object.label ? object.label : object.id;
      store.getState().select({ kind: parsed.kind === "workflow-node" ? "node" : "edge", id: parsed.id }, undefined, true);
      store.getState().logInvocation("reveal_workflow_object", "Completed");
      return { kind: parsed.kind, id: parsed.id, label, focused: `#${parsed.kind === "workflow-node" ? "node" : "edge"}-inspector-heading` };
    },
    get_change_receipt(input: unknown) {
      const { operationId } = operationInputSchema.parse(input);
      const receipt = store.getState().history.find((item) => item.operationId === operationId);
      if (!receipt) throw new Error(`Receipt ${operationId} does not exist.`);
      store.getState().logInvocation("get_change_receipt", "Completed");
      return receipt;
    },
    undo_workflow_change(input: unknown) {
      const { operationId } = operationInputSchema.parse(input);
      const receipt = store.getState().undo(operationId);
      store.getState().logInvocation("undo_workflow_change", "Completed");
      return receipt;
    },
  };
}

export type ToolHandlers = ReturnType<typeof createToolHandlers>;
