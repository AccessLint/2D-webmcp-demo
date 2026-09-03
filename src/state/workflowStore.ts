import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import { executeBatch, type WorkflowCommand } from "../graph/commands";
import type { WorkflowState } from "../graph/model";
import { nodeDefinitions } from "../graph/nodeTypes";
import { createReceipt } from "../receipts/createReceipt";
import type { ChangeReceipt } from "../receipts/schema";
import { toolNames } from "../webmcp/toolNames";
import { installSessionPersistence } from "./sessionPersistence";

export type Invocation = {
  id: string;
  tool: string;
  at: string;
  outcome: "completed" | "failed" | "aborted";
  code?: string;
  durationMs: number;
  parameterNames: string[];
  unknownParameterCount?: number;
  baseRevision?: number;
  resultingRevision?: number;
  operationId?: string;
};
export type InvocationInput = Omit<Invocation, "id" | "at">;
export class WorkflowUndoError extends Error {
  constructor(readonly code: "UNDO_NOT_AVAILABLE" | "UNDO_REVISION_CONFLICT", message: string) {
    super(message);
    this.name = "WorkflowUndoError";
  }
}
export type WorkflowSnapshot = { operationId: string; state: WorkflowState; resultingRevision: number };
export type WorkflowSelection = { kind: "node" | "edge"; id: string };
export type WorkflowConnectionSource = { nodeId: string; port: string };

export type WorkflowStore = {
  workflow: WorkflowState;
  history: ChangeReceipt[];
  snapshots: WorkflowSnapshot[];
  selected: WorkflowSelection | null;
  connectionSource: WorkflowConnectionSource | null;
  returnFocusId: string | null;
  focusRequest: number;
  politeMessage: string;
  assertiveMessage: string;
  invocations: Invocation[];
  apply: (baseRevision: number, commands: WorkflowCommand[], intent?: string) => ChangeReceipt;
  undo: (operationId: string) => ChangeReceipt;
  select: (selection: WorkflowSelection | null, returnFocusId?: string, focusInspector?: boolean) => void;
  setConnectionSource: (source: WorkflowConnectionSource | null) => void;
  reportStatus: (message: string) => void;
  reportError: (message: string) => void;
  clear: () => ChangeReceipt;
  reset: () => void;
  logInvocation: (invocation: InvocationInput) => void;
};

const DEFAULT_SELECTION: WorkflowSelection = { kind: "node", id: "patient-arrives" };

export const createEmptyWorkflow = (): WorkflowState => ({
  revision: 0,
  nodes: [],
  edges: [],
});

function reconcileConnectionSource(
  workflow: WorkflowState,
  source: WorkflowConnectionSource | null,
): WorkflowConnectionSource | null {
  if (!source) return null;
  const node = workflow.nodes.find((item) => item.id === source.nodeId);
  return node && nodeDefinitions[node.type].outputs.includes(source.port) ? source : null;
}

function createInitialState(workflow: WorkflowState) {
  return {
    workflow: structuredClone(workflow),
    history: [],
    snapshots: [],
    selected: workflow.nodes.some((node) => node.id === DEFAULT_SELECTION.id)
      ? DEFAULT_SELECTION
      : null,
    connectionSource: null,
    returnFocusId: null,
    focusRequest: 0,
    politeMessage: "",
    assertiveMessage: "",
    invocations: [],
  } satisfies Omit<
    WorkflowStore,
    "apply" | "undo" | "select" | "setConnectionSource" | "reportStatus" | "reportError" | "clear" | "reset" | "logInvocation"
  >;
}

function createFailedReceipt(
  workflow: WorkflowState,
  baseRevision: number,
  result: Extract<ReturnType<typeof executeBatch>, { ok: false }>,
  intent?: string,
): ChangeReceipt {
  return {
    schemaVersion: "0.1",
    operationId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    baseRevision,
    resultingRevision: workflow.revision,
    status: result.status,
    summary: result.status === "conflict"
      ? "Workflow change was not applied because the revision was stale."
      : "Workflow change failed and was not applied.",
    intent,
    affected: [],
    changes: [],
    undo: { available: false },
    failure: { code: result.code, message: result.message },
    recovery: {
      tool: toolNames.discoverWorkflow,
      input: {},
      currentRevision: workflow.revision,
      then: toolNames.editWorkflow,
    },
  };
}

export function createWorkflowStore(initial = createEmptyWorkflow()): StoreApi<WorkflowStore> {
  return createStore<WorkflowStore>((set, get) => ({
    ...createInitialState(initial),
    apply: (baseRevision, commands, intent) => {
      const before = get().workflow;
      const result = executeBatch(before, { baseRevision, commands });
      if (!result.ok) {
        const receipt = createFailedReceipt(before, baseRevision, result, intent);
        set((current) => ({
          history: [receipt, ...current.history],
          assertiveMessage: `${receipt.summary} ${result.message}`,
        }));
        return receipt;
      }

      const receipt = createReceipt({ before, after: result.state, intent });
      set((current) => ({
        workflow: result.state,
        history: [receipt, ...current.history],
        snapshots: [
          ...current.snapshots,
          {
            operationId: receipt.operationId,
            state: structuredClone(before),
            resultingRevision: result.state.revision,
          },
        ],
        connectionSource: reconcileConnectionSource(result.state, current.connectionSource),
        politeMessage: receipt.summary,
        assertiveMessage: "",
      }));
      return receipt;
    },
    undo: (operationId) => {
      const current = get();
      const snapshot = current.snapshots.find((item) => item.operationId === operationId);
      if (!snapshot) {
        throw new WorkflowUndoError("UNDO_NOT_AVAILABLE", `Operation ${operationId} cannot be undone.`);
      }
      if (snapshot.resultingRevision !== current.workflow.revision) {
        throw new WorkflowUndoError("UNDO_REVISION_CONFLICT", "This change cannot be undone after a later workflow edit.");
      }

      const restored = { ...structuredClone(snapshot.state), revision: current.workflow.revision + 1 };
      const receipt = createReceipt({
        before: current.workflow,
        after: restored,
        undo: true,
      });
      set({
        workflow: restored,
        history: [
          receipt,
          ...current.history.map((item) => item.operationId === operationId
            ? { ...item, undo: { available: false } }
            : item),
        ],
        snapshots: current.snapshots.filter((item) => item.operationId !== operationId),
        connectionSource: reconcileConnectionSource(restored, current.connectionSource),
        politeMessage: receipt.summary,
      });
      return receipt;
    },
    select: (selected, returnFocusId, focusInspector = false) => set((current) => ({
      selected,
      returnFocusId: returnFocusId ?? null,
      focusRequest: focusInspector ? current.focusRequest + 1 : current.focusRequest,
    })),
    setConnectionSource: (connectionSource) => set({ connectionSource }),
    reportStatus: (politeMessage) => set({ politeMessage }),
    reportError: (assertiveMessage) => set({ assertiveMessage }),
    clear: () => {
      const current = get();
      const cleared = {
        revision: current.workflow.revision + 1,
        nodes: [],
        edges: [],
      } satisfies WorkflowState;
      const receipt = createReceipt({
        before: current.workflow,
        after: cleared,
        intent: "Clear canvas",
      });
      set({
        workflow: cleared,
        history: [receipt, ...current.history],
        snapshots: [
          ...current.snapshots,
          {
            operationId: receipt.operationId,
            state: structuredClone(current.workflow),
            resultingRevision: cleared.revision,
          },
        ],
        selected: null,
        connectionSource: null,
        returnFocusId: null,
        politeMessage: "Cleared the canvas.",
        assertiveMessage: "",
      });
      return receipt;
    },
    reset: () => set({
      ...createInitialState(createEmptyWorkflow()),
      politeMessage: "Workflow reset.",
    }),
    logInvocation: (invocation) => {
      const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), ...invocation };
      set((current) => ({ invocations: [entry, ...current.invocations].slice(0, 100) }));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("webmcp:invocation", { detail: entry }));
      }
    },
  }));
}

export const workflowStore = createWorkflowStore();
installSessionPersistence(workflowStore);

export function useWorkflowStore<T>(selector: (state: WorkflowStore) => T): T {
  return useStore(workflowStore, selector);
}
