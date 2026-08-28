import type { ApplicationReference } from "../graph/model";
import { changeHeadingId } from "../receipts/dom";
import type { ChangeReceipt } from "../receipts/schema";
import { useWorkflowStore } from "../state/workflowStore";

function unavailableLabel(receipt: ChangeReceipt, reference: ApplicationReference) {
  const action = receipt.changes.find((change) => change.object.kind === reference.kind && change.object.id === reference.id)?.action;
  if (action === "deleted") return "Deleted";
  if (action === "disconnected") return "Disconnected";
  return "Unavailable";
}

export function ChangeHistory() {
  const history = useWorkflowStore((state) => state.history);
  const workflow = useWorkflowStore((state) => state.workflow);
  const reviewed = useWorkflowStore((state) => state.reviewed);
  const select = useWorkflowStore((state) => state.select);
  const markReviewed = useWorkflowStore((state) => state.markReviewed);
  const undo = useWorkflowStore((state) => state.undo);
  const reportError = useWorkflowStore((state) => state.reportError);
  const referenceExists = (reference: ApplicationReference) => reference.kind === "workflow-node"
    ? workflow.nodes.some((item) => item.id === reference.id)
    : reference.kind === "workflow-edge" && workflow.edges.some((item) => item.id === reference.id);
  const reveal = (reference: ApplicationReference) => {
    const kind = reference.kind === "workflow-node" ? "node" : reference.kind === "workflow-edge" ? "edge" : null;
    if (!kind || !referenceExists(reference)) { reportError(`${reference.label} no longer exists in the current workflow.`); return; }
    select({ kind, id: reference.id }, undefined, true);
  };
  const focusReceipt = (operationId: string) => queueMicrotask(() => document.getElementById(changeHeadingId(operationId))?.focus());
  const runUndo = (operationId: string) => { try { undo(operationId); focusReceipt(operationId); } catch (error) { reportError(error instanceof Error ? error.message : "Undo failed."); } };
  return <section className="history" aria-labelledby="change-history-heading">
    <div className="history-heading"><h2 id="change-history-heading">Change history</h2></div>
    {history.length === 0 ? <div className="empty-history"><p>No changes yet.</p></div> : <ol className="history-list">{history.map((receipt) => {
      const affected = receipt.affected.filter((reference) => reference.kind !== "change-receipt");
      return <li key={receipt.operationId}><article id={`change-${receipt.operationId}`} aria-labelledby={changeHeadingId(receipt.operationId)} className="change-card">
        <div className="change-topline"><span className={`status-pill status-pill--${receipt.status}`}>{receipt.status}</span><span className="review-state">{reviewed.includes(receipt.operationId) ? "Reviewed" : "Unreviewed"}</span></div>
        <h3 tabIndex={-1} id={changeHeadingId(receipt.operationId)}>{receipt.summary}</h3>
        {receipt.validation.problems.length ? <div className={`problems${receipt.validation.valid ? "" : " problems--error"}`}><h4>{receipt.validation.valid ? "Warnings" : "Needs attention"}</h4><ul>{receipt.validation.problems.map((problem, problemIndex) => <li key={`${problem.code}-${problemIndex}`}>{problem.message}</li>)}</ul></div> : null}
        <div className="change-footer">
          {affected.length ? <div className="affected" aria-label="Affected objects">{affected.map((reference) => referenceExists(reference)
            ? <button key={`${reference.kind}-${reference.id}`} onClick={() => reveal(reference)}>Reveal {reference.label}</button>
            : <span className="removed-object" key={`${reference.kind}-${reference.id}`}>{unavailableLabel(receipt, reference)} {reference.label}</span>)}</div> : null}
          <div className="change-actions"><button onClick={() => markReviewed(receipt.operationId)} disabled={reviewed.includes(receipt.operationId)}>{reviewed.includes(receipt.operationId) ? "Reviewed" : "Mark reviewed"}</button>{receipt.undo.available ? <button className="undo-button" onClick={() => runUndo(receipt.operationId)}>Undo</button> : null}</div>
        </div>
      </article></li>;
    })}</ol>}
  </section>;
}
