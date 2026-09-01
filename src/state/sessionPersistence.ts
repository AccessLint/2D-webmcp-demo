import type { StoreApi } from "zustand/vanilla";
import type { WorkflowStore } from "./workflowStore";

const SESSION_KEY = "workflow-evidence-session-v2";

type PersistedWorkflowSession = Pick<
  WorkflowStore,
  "workflow" | "history" | "snapshots" | "reviewed" | "selected" | "invocations"
>;

function isPersistedWorkflowSession(value: unknown): value is Partial<PersistedWorkflowSession> {
  if (!value || typeof value !== "object") return false;
  const workflow = Reflect.get(value, "workflow");
  return Boolean(
    workflow
      && typeof workflow === "object"
      && Array.isArray(Reflect.get(workflow, "nodes"))
      && Array.isArray(Reflect.get(workflow, "edges")),
  );
}

function sessionSnapshot(state: WorkflowStore): PersistedWorkflowSession {
  return {
    workflow: state.workflow,
    history: state.history,
    snapshots: state.snapshots,
    reviewed: state.reviewed,
    selected: state.selected,
    invocations: state.invocations,
  };
}

export function installSessionPersistence(store: StoreApi<WorkflowStore>): void {
  if (typeof window === "undefined") return;

  try {
    const savedSession = window.sessionStorage.getItem(SESSION_KEY);
    if (savedSession) {
      const parsedSession: unknown = JSON.parse(savedSession);
      if (isPersistedWorkflowSession(parsedSession)) {
        store.setState(parsedSession);
      }
    }

    store.subscribe((state) => {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot(state)));
    });
  } catch {
    // In private or restricted contexts, the in-memory store remains fully functional.
  }
}
