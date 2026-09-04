import type { StoreApi } from "zustand/vanilla";
import type { WorkflowEdge, WorkflowNode, WorkflowState } from "../graph/model";
import { relationshipsForNode } from "../graph/selectors";
import { edgeReference, nodeReference } from "../graph/references";
import { WorkflowUndoError, type InvocationInput, type WorkflowStore } from "../state/workflowStore";
import {
  applyInputSchema,
  discoveryInputSchema,
  inspectInputSchema,
  normalizeCommands,
  operationInputSchema,
  showTargetInputSchema,
} from "./toolSchemas";
import { browserUiActions, type UiActions } from "./uiActions";
import { selectorForUiTarget } from "./uiTargets";
import { workflowSummary } from "./discovery";
import { toPublicWorkflowEdge } from "./edgeContract";
import { ToolError } from "./errors";
import { toolNames } from "./toolNames";

type ToolHandlerOptions = {
  waitForNodeReveal?: (signal?: AbortSignal) => Promise<void>;
};

const NODE_REVEAL_INTERVAL_MS = 180;

const wait = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal?.throwIfAborted();
  const timeout = window.setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve();
  }, milliseconds);
  const onAbort = () => {
    window.clearTimeout(timeout);
    reject(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"));
  };
  signal?.addEventListener("abort", onAbort, { once: true });
});

const waitForNodeReveal = async (signal?: AbortSignal) => {
  if (typeof document === "undefined" || !document.querySelector(".canvas-shell")) return;
  await wait(NODE_REVEAL_INTERVAL_MS, signal);
};

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

function requireReceipt(store: StoreApi<WorkflowStore>, operationId: string) {
  const receipt = store.getState().history.find((item) => item.operationId === operationId);
  if (!receipt) throw new ToolError("NOT_FOUND", `Receipt ${operationId} does not exist.`);
  return receipt;
}

function isAbortError(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || (error instanceof DOMException && error.name === "AbortError");
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
    ...toPublicWorkflowEdge(edge),
    reference: edgeReference(edge),
    sourceNode: nodeReference(requireNode(state, edge.source)),
    targetNode: nodeReference(requireNode(state, edge.target)),
  };
}

export function createToolHandlers(
  store: StoreApi<WorkflowStore>,
  uiActions: UiActions = browserUiActions,
  handlerOptions: ToolHandlerOptions = {},
) {
  const checkAbort = (options?: { signal: AbortSignal }) => options?.signal?.throwIfAborted();
  let revealController: AbortController | null = null;
  const revealCreatedNodes = async (operationId: string, nodeIds: string[]) => {
    revealController?.abort();
    const controller = new AbortController();
    revealController = controller;
    try {
      for (const nodeId of nodeIds) {
        if (store.getState().nodeReveal?.operationId !== operationId) break;
        store.getState().revealNode(operationId, nodeId);
        await (handlerOptions.waitForNodeReveal ?? waitForNodeReveal)(controller.signal);
      }
    } catch (error) {
      if (!isAbortError(error, controller.signal)
        && store.getState().nodeReveal?.operationId === operationId) {
        store.getState().reportError("Workflow committed, but incremental node reveal stopped early.");
      }
    } finally {
      if (revealController === controller) revealController = null;
      store.getState().finishNodeReveal(operationId);
    }
  };
  return {
    [toolNames.discoverWorkflow](input: unknown, options?: { signal: AbortSignal }) {
      checkAbort(options);
      discoveryInputSchema.parse(input);
      return workflowSummary(store.getState().workflow);
    },
    [toolNames.inspectWorkflowItems](input: unknown, options?: { signal: AbortSignal }) {
      checkAbort(options);
      const { objects } = inspectInputSchema.parse(input);
      const state = store.getState().workflow;
      return objects.map(({ kind, id }) => {
        if (kind === "workflow-node") return inspectNode(state, id);
        if (kind === "workflow-edge") return inspectEdge(state, id);
        const receipt = requireReceipt(store, id);
        return {
          ...receipt,
          reference: { kind: "change-receipt" as const, id, label: receipt.summary },
        };
      });
    },
    async [toolNames.editWorkflow](input: unknown, options?: { signal: AbortSignal }) {
      checkAbort(options);
      const parsed = applyInputSchema.parse(input);
      const currentWorkflow = store.getState().workflow;
      const canvasIsEmpty = currentWorkflow.nodes.length === 0 && currentWorkflow.edges.length === 0;
      if (parsed.baseRevision === undefined && !canvasIsEmpty) {
        throw new ToolError("BASE_REVISION_REQUIRED", "baseRevision is required when the canvas is not empty.");
      }
      const createsOnly = parsed.commands.every((command) => (
        command.type === "createNode" || command.type === "connect"
      ));
      if (parsed.baseRevision === undefined && !createsOnly) {
        throw new ToolError(
          "BASE_REVISION_REQUIRED",
          "baseRevision may be omitted only for an empty-canvas batch that creates nodes and connections.",
        );
      }
      const baseRevision = parsed.baseRevision ?? currentWorkflow.revision;
      const createdNodeIds = parsed.commands.flatMap((command) => (
        command.type === "createNode" ? [command.node.id] : []
      ));
      const incrementallyRevealedNodeIds = createdNodeIds.length > 1 ? createdNodeIds : [];
      const receipt = store.getState().apply(
        baseRevision,
        normalizeCommands(parsed.commands, store.getState().workflow.nodes),
        undefined,
        {
          autoLayoutNodeIds: createdNodeIds,
          initiallyHiddenNodeIds: incrementallyRevealedNodeIds,
          cleanUpLayout: true,
        },
      );
      if (receipt.status === "completed" && incrementallyRevealedNodeIds.length > 0) {
        const nodeReveal = store.getState().nodeReveal;
        const pendingNodeIds = nodeReveal?.operationId === receipt.operationId
          ? [...nodeReveal.pendingNodeIds]
          : [];
        void revealCreatedNodes(receipt.operationId, pendingNodeIds);
      }
      return receipt;
    },
    async [toolNames.showTarget](input: unknown, options?: { signal: AbortSignal }) {
      checkAbort(options);
      const parsed = showTargetInputSchema.parse(input);
      if (parsed.kind === "page-element") {
        const selector = selectorForUiTarget(parsed.id);
        const focusResult = await uiActions.focusDomNode(selector, options?.signal);
        return { ...focusResult, targetId: parsed.id };
      }
      if (parsed.kind === "change-receipt") {
        const receipt = requireReceipt(store, parsed.id);
        const focusResult = await uiActions.focusChangeEntry(parsed.id, options?.signal);
        return { ...focusResult, summary: receipt.summary, status: receipt.status };
      }
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
        ? await uiActions.focusWorkflowNode(parsed.id, options?.signal)
        : { focused: false as const, visible: null };
      return {
        kind: parsed.kind,
        id: parsed.id,
        label,
        revealedIn: "workflow-canvas",
        focused: focusResult.focused,
        visible: focusResult.visible,
      };
    },
    [toolNames.undoWorkflowEdit](input: unknown, options?: { signal: AbortSignal }) {
      checkAbort(options);
      const { operationId } = operationInputSchema.parse(input);
      try {
        return store.getState().undo(operationId);
      } catch (error) {
        if (error instanceof WorkflowUndoError) throw new ToolError(error.code, error.message);
        throw error;
      }
    },
    recordInvocation(invocation: InvocationInput) {
      store.getState().logInvocation(invocation);
    },
    dispose() {
      revealController?.abort();
      revealController = null;
      uiActions.cancelPendingDomFocus?.();
    },
  };
}

export type ToolHandlers = ReturnType<typeof createToolHandlers>;
