import type { ApplicationReference } from "../graph/model";
import type { WorkflowChange } from "../receipts/schema";
import { useWorkflowStore } from "../state/workflowStore";

const actionLabels: Record<WorkflowChange["action"], string> = { created: "Created", updated: "Updated", deleted: "Deleted", connected: "Connected", disconnected: "Disconnected", restored: "Restored" };

function describeObject(value: WorkflowChange["before"] | WorkflowChange["after"]) {
  if (!value) return "Not present";
  if ("source" in value) return `${value.source} (${value.sourcePort}) → ${value.target} (${value.targetPort})`;
  const properties = Object.entries(value.properties).map(([name, property]) => `${name}: ${String(property)}`).join(", ");
  return `${value.label}, ${value.type}${properties ? `, ${properties}` : ""}`;
}

export function ChangeHistory() {
  const history = useWorkflowStore((state) => state.history);
  const workflow = useWorkflowStore((state) => state.workflow);
  const reviewed = useWorkflowStore((state) => state.reviewed);
  const select = useWorkflowStore((state) => state.select);
  const markReviewed = useWorkflowStore((state) => state.markReviewed);
  const undo = useWorkflowStore((state) => state.undo);
  const reportError = useWorkflowStore((state) => state.reportError);
  const inspect = (reference: ApplicationReference, controlId: string) => {
    const kind = reference.kind === "workflow-node" ? "node" : reference.kind === "workflow-edge" ? "edge" : null;
    const exists = kind === "node" ? workflow.nodes.some((item) => item.id === reference.id) : kind === "edge" ? workflow.edges.some((item) => item.id === reference.id) : false;
    if (!kind || !exists) { reportError(`${reference.label} no longer exists in the current workflow.`); return; }
    select({ kind, id: reference.id }, controlId, true);
  };
  const focusReceipt = (operationId: string) => queueMicrotask(() => document.getElementById(`change-heading-${operationId}`)?.focus());
  const reviewLatest = () => { const latest = history[0]; if (latest) { markReviewed(latest.operationId); focusReceipt(latest.operationId); } };
  const runUndo = (operationId: string) => { try { undo(operationId); focusReceipt(operationId); } catch (error) { reportError(error instanceof Error ? error.message : "Undo failed."); } };
  return <section className="history" aria-labelledby="change-history-heading">
    <div className="history-heading"><div><p className="eyebrow">Application evidence</p><h2 id="change-history-heading">Change history</h2></div><div className="history-heading__actions"><p>{history.length ? `${history.length} recorded ${history.length === 1 ? "operation" : "operations"}` : "No operations yet"}</p>{history.length ? <button onClick={reviewLatest}>Review latest change</button> : null}</div></div>
    {history.length === 0 ? <div className="empty-history"><span aria-hidden="true">◎</span><h3>Your evidence trail starts here</h3><p>Run the demo or invoke a WebMCP editing tool. The application will record exactly what changed.</p></div> : <ol className="history-list">{history.map((receipt) => {
      const counts = receipt.changes.reduce<Record<string, number>>((all, change) => ({ ...all, [change.action]: (all[change.action] ?? 0) + 1 }), {});
      return <li key={receipt.operationId}><article id={`change-${receipt.operationId}`} aria-labelledby={`change-heading-${receipt.operationId}`} className="change-card">
        <div className="change-topline"><span className={`status-pill status-pill--${receipt.status}`}>{receipt.status}</span><span>{new Date(receipt.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><span>Revision {receipt.baseRevision} → {receipt.resultingRevision}</span><span className="review-state">{reviewed.includes(receipt.operationId) ? "Reviewed" : "Unreviewed"}</span></div>
        <h3 tabIndex={-1} id={`change-heading-${receipt.operationId}`}>{receipt.summary}</h3>
        {receipt.intent ? <p className="intent"><span>Agent intent · unverified</span>{receipt.intent}</p> : null}
        <ul className="change-counts" aria-label="Change counts">{Object.entries(counts).map(([action, count]) => <li key={action}><strong>{count}</strong> {action}</li>)}</ul>
        <p className={receipt.validation.valid ? "validation-pass" : "validation-fail"}><span aria-hidden="true">{receipt.validation.valid ? "✓" : "!"}</span>{receipt.validation.valid ? "Workflow validation passed" : "Workflow validation has errors"}</p>
        {receipt.warnings.length ? <div className="warnings"><h4>Warnings</h4><ul>{receipt.warnings.map((warning, warningIndex) => <li key={`${warning.code}-${warningIndex}`}>{warning.message}</li>)}</ul></div> : null}
        <div className="affected"><h4>Affected objects</h4><div>{receipt.affected.filter((ref) => ref.kind !== "change-receipt").map((reference, refIndex) => <button key={`${reference.kind}-${reference.id}`} id={`inspect-${receipt.operationId}-${refIndex}`} onClick={() => inspect(reference, `inspect-${receipt.operationId}-${refIndex}`)}>Inspect {reference.label}</button>)}</div></div>
        <details><summary>Exact changes</summary>{receipt.changes.length ? <ol className="exact-changes">{receipt.changes.map((change, changeIndex) => <li key={`${change.object.id}-${changeIndex}`}><span>{actionLabels[change.action]}</span><strong>{change.object.label}</strong><code>{change.object.id}</code>{change.before ? <p><span>Before</span>{describeObject(change.before)}</p> : null}{change.after ? <p><span>After</span>{describeObject(change.after)}</p> : null}</li>)}</ol> : <p>No graph objects changed.</p>}</details>
        <div className="change-actions"><button onClick={() => markReviewed(receipt.operationId)} disabled={reviewed.includes(receipt.operationId)}>{reviewed.includes(receipt.operationId) ? "Marked reviewed" : "Mark reviewed"}</button>{receipt.undo.available ? <button className="undo-button" onClick={() => runUndo(receipt.operationId)}>Undo this change</button> : null}</div>
      </article></li>;
    })}</ol>}
  </section>;
}
