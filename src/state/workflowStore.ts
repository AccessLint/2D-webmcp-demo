import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import { executeBatch, type WorkflowCommand } from "../graph/commands";
import type { WorkflowState } from "../graph/model";
import { createSeedWorkflow } from "../graph/seedWorkflow";
import { validateWorkflow } from "../graph/validation";
import { createReceipt } from "../receipts/createReceipt";
import type { ChangeReceipt } from "../receipts/schema";
import { toolNames } from "../webmcp/toolNames";
import { installSessionPersistence } from "./sessionPersistence";

export type Invocation = { id: string; tool: string; at: string; outcome: string };
export type WorkflowSnapshot = { operationId: string; state: WorkflowState; resultingRevision: number };
export type WorkflowSelection = { kind: "node" | "edge"; id: string };

export type WorkflowStore = {
  workflow: WorkflowState;
  history: ChangeReceipt[];
  snapshots: WorkflowSnapshot[];
  reviewed: string[];
  selected: WorkflowSelection | null;
  returnFocusId: string | null;
  focusRequest: number;
  politeMessage: string;
  assertiveMessage: string;
  invocations: Invocation[];
  apply: (baseRevision: number, commands: WorkflowCommand[], intent?: string) => ChangeReceipt;
  undo: (operationId: string) => ChangeReceipt;
  select: (selection: WorkflowSelection | null, returnFocusId?: string, focusInspector?: boolean) => void;
  reportError: (message: string) => void;
  markReviewed: (operationId: string) => void;
  reset: () => void;
  logInvocation: (tool: string, outcome: string) => void;
};

const DEFAULT_SELECTION: WorkflowSelection = { kind: "node", id: "fetch-orders" };

function createInitialState(workflow: WorkflowState) {
  return {
    workflow: structuredClone(workflow),
    history: [],
    snapshots: [],
    reviewed: [],
    selected: DEFAULT_SELECTION,
    returnFocusId: null,
    focusRequest: 0,
    politeMessage: "",
    assertiveMessage: "",
    invocations: [],
  } satisfies Omit<
    WorkflowStore,
    "apply" | "undo" | "select" | "reportError" | "markReviewed" | "reset" | "logInvocation"
  >;
}

function createFailedReceipt(
  workflow: WorkflowState,
  baseRevision: number,
  result: Extract<ReturnType<typeof executeBatch>, { ok: false }>,
  intent?: string,
): ChangeReceipt {
  const validation = validateWorkflow(workflow);
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
    validation,
    warnings: validation.problems.filter((problem) => problem.severity === "warning"),
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

export function createWorkflowStore(initial = createSeedWorkflow()): StoreApi<WorkflowStore> {
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

      const receipt = createReceipt({ before, after: result.state, validation: result.validation, intent });
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
        politeMessage: receipt.summary,
        assertiveMessage: "",
      }));
      return receipt;
    },
    undo: (operationId) => {
      const current = get();
      const snapshot = current.snapshots.find((item) => item.operationId === operationId);
      if (!snapshot) {
        throw new Error(`Operation ${operationId} cannot be undone.`);
      }
      if (snapshot.resultingRevision !== current.workflow.revision) {
        throw new Error("This change cannot be undone after a later workflow edit.");
      }

      const restored = { ...structuredClone(snapshot.state), revision: current.workflow.revision + 1 };
      const receipt = createReceipt({
        before: current.workflow,
        after: restored,
        validation: validateWorkflow(restored),
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
        politeMessage: receipt.summary,
      });
      return receipt;
    },
    select: (selected, returnFocusId, focusInspector = false) => set((current) => ({
      selected,
      returnFocusId: returnFocusId ?? null,
      focusRequest: focusInspector ? current.focusRequest + 1 : current.focusRequest,
    })),
    reportError: (assertiveMessage) => set({ assertiveMessage }),
    markReviewed: (operationId) => set((current) => ({
      reviewed: current.reviewed.includes(operationId)
        ? current.reviewed
        : [...current.reviewed, operationId],
    })),
    reset: () => set({
      ...createInitialState(createSeedWorkflow()),
      politeMessage: "Workflow reset.",
    }),
    logInvocation: (tool, outcome) => set((current) => ({
      invocations: [
        { id: crypto.randomUUID(), tool, at: new Date().toISOString(), outcome },
        ...current.invocations,
      ].slice(0, 8),
    })),
  }));
}

export const workflowStore = createWorkflowStore();
installSessionPersistence(workflowStore);

export function useWorkflowStore<T>(selector: (state: WorkflowStore) => T): T {
  return useStore(workflowStore, selector);
}
