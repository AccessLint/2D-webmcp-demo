import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import { executeBatch, type WorkflowCommand } from "../graph/commands";
import type { WorkflowState } from "../graph/model";
import { createSeedWorkflow } from "../graph/seedWorkflow";
import { validateWorkflow } from "../graph/validation";
import { createReceipt } from "../receipts/createReceipt";
import type { ChangeReceipt } from "../receipts/schema";

export type Invocation = { id: string; tool: string; at: string; outcome: string };
type Snapshot = { operationId: string; state: WorkflowState; resultingRevision: number };

export type WorkflowStore = {
  workflow: WorkflowState;
  history: ChangeReceipt[];
  snapshots: Snapshot[];
  reviewed: string[];
  selected: { kind: "node" | "edge"; id: string } | null;
  returnFocusId: string | null;
  focusRequest: number;
  politeMessage: string;
  assertiveMessage: string;
  invocations: Invocation[];
  apply: (baseRevision: number, commands: WorkflowCommand[], intent?: string) => ChangeReceipt;
  undo: (operationId: string) => ChangeReceipt;
  select: (selection: WorkflowStore["selected"], returnFocusId?: string, focusInspector?: boolean) => void;
  reportError: (message: string) => void;
  markReviewed: (operationId: string) => void;
  reset: () => void;
  logInvocation: (tool: string, outcome: string) => void;
};

export function createWorkflowStore(initial = createSeedWorkflow()): StoreApi<WorkflowStore> {
  return createStore<WorkflowStore>((set, get) => ({
    workflow: structuredClone(initial), history: [], snapshots: [], reviewed: [], selected: { kind: "node", id: "fetch-orders" }, returnFocusId: null, focusRequest: 0,
    politeMessage: "", assertiveMessage: "", invocations: [],
    apply: (baseRevision, commands, intent) => {
      const before = get().workflow;
      const result = executeBatch(before, { baseRevision, commands });
      if (!result.ok) {
        const validation = validateWorkflow(before);
        const receipt: ChangeReceipt = {
          schemaVersion: "0.1", operationId: crypto.randomUUID(), timestamp: new Date().toISOString(),
          baseRevision, resultingRevision: before.revision, status: result.status,
          summary: `Workflow change ${result.status === "conflict" ? "was not applied because the revision was stale" : "failed and was not applied"}.`,
          intent, affected: [], changes: [], validation, warnings: validation.problems.filter((problem) => problem.severity === "warning"), undo: { available: false },
          failure: { code: result.code, message: result.message },
          recovery: { tool: "get_workflow_summary", input: {}, currentRevision: before.revision, then: "apply_workflow_changes" },
        };
        set((current) => ({ history: [receipt, ...current.history], assertiveMessage: `${receipt.summary} ${result.message}` }));
        return receipt;
      }
      const receipt = createReceipt({ before, after: result.state, validation: result.validation, intent });
      set((current) => ({
        workflow: result.state,
        history: [receipt, ...current.history],
        snapshots: [...current.snapshots, { operationId: receipt.operationId, state: structuredClone(before), resultingRevision: result.state.revision }],
        politeMessage: receipt.summary,
        assertiveMessage: "",
      }));
      return receipt;
    },
    undo: (operationId) => {
      const current = get();
      const snapshot = current.snapshots.find((item) => item.operationId === operationId);
      if (!snapshot) throw new Error(`Operation ${operationId} cannot be undone.`);
      if (snapshot.resultingRevision !== current.workflow.revision) throw new Error("This change cannot be undone after a later workflow edit.");
      const restored = { ...structuredClone(snapshot.state), revision: current.workflow.revision + 1 };
      const receipt = createReceipt({ before: current.workflow, after: restored, validation: validateWorkflow(restored), undo: true });
      set({ workflow: restored, history: [receipt, ...current.history.map((item) => item.operationId === operationId ? { ...item, undo: { available: false } } : item)], snapshots: current.snapshots.filter((item) => item.operationId !== operationId), politeMessage: receipt.summary });
      return receipt;
    },
    select: (selected, returnFocusId, focusInspector = false) => set((current) => ({ selected, returnFocusId: returnFocusId ?? null, focusRequest: focusInspector ? current.focusRequest + 1 : current.focusRequest })),
    reportError: (assertiveMessage) => set({ assertiveMessage }),
    markReviewed: (operationId) => set((current) => ({ reviewed: current.reviewed.includes(operationId) ? current.reviewed : [...current.reviewed, operationId] })),
    reset: () => set({ workflow: createSeedWorkflow(), history: [], snapshots: [], reviewed: [], selected: { kind: "node", id: "fetch-orders" }, returnFocusId: null, focusRequest: 0, politeMessage: "Workflow reset.", assertiveMessage: "", invocations: [] }),
    logInvocation: (tool, outcome) => set((current) => ({ invocations: [{ id: crypto.randomUUID(), tool, at: new Date().toISOString(), outcome }, ...current.invocations].slice(0, 8) })),
  }));
}

export const workflowStore = createWorkflowStore();

const sessionKey = "workflow-evidence-session-v1";
if (typeof window !== "undefined") {
  try {
    const saved = window.sessionStorage.getItem(sessionKey);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Pick<WorkflowStore, "workflow" | "history" | "snapshots" | "reviewed" | "selected" | "invocations">>;
      if (parsed.workflow && Array.isArray(parsed.workflow.nodes) && Array.isArray(parsed.workflow.edges)) workflowStore.setState(parsed);
    }
    workflowStore.subscribe((state) => {
      window.sessionStorage.setItem(sessionKey, JSON.stringify({ workflow: state.workflow, history: state.history, snapshots: state.snapshots, reviewed: state.reviewed, selected: state.selected, invocations: state.invocations }));
    });
  } catch {
    // Storage can be unavailable in private or restricted browser contexts; in-memory behavior remains complete.
  }
}
export const useWorkflowStore = <T>(selector: (state: WorkflowStore) => T) => useStore(workflowStore, selector);
