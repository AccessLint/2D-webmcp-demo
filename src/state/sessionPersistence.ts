import type { StoreApi } from "zustand/vanilla";
import type { WorkflowStore } from "./workflowStore";

const SESSION_KEY = "workflow-evidence-session-v6-empty-canvas";

type PersistedWorkflowSession = Pick<
  WorkflowStore,
  "workflow" | "history" | "snapshots" | "autoLayoutNodeIds" | "selected" | "invocations"
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

function persistedAutoLayoutNodeIds(
  session: Partial<PersistedWorkflowSession>,
  fallback: string[],
): string[] {
  const nodeIds: unknown = session.autoLayoutNodeIds;
  return Array.isArray(nodeIds) && nodeIds.every((id) => typeof id === "string")
    ? nodeIds
    : fallback;
}

function sessionSnapshot(state: WorkflowStore): PersistedWorkflowSession {
  return {
    workflow: state.workflow,
    history: state.history,
    snapshots: state.snapshots,
    autoLayoutNodeIds: state.autoLayoutNodeIds,
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
        const current = store.getState();
        store.setState({
          workflow: parsedSession.workflow ?? current.workflow,
          history: parsedSession.history ?? current.history,
          snapshots: parsedSession.snapshots ?? current.snapshots,
          // Legacy sessions have no ownership metadata. Preserve their canvas,
          // but conservatively treat its positions as user-owned.
          autoLayoutNodeIds: persistedAutoLayoutNodeIds(parsedSession, current.autoLayoutNodeIds),
          selected: parsedSession.selected ?? current.selected,
          invocations: parsedSession.invocations ?? current.invocations,
        });
      }
    }

    store.subscribe((state) => {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot(state)));
    });
  } catch {
    // In private or restricted contexts, the in-memory store remains fully functional.
  }
}
