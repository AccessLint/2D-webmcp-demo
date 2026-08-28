import type { ApplicationReference, WorkflowState } from "../graph/model";
import { changeHeadingId } from "../receipts/dom";
import type { ChangeReceipt } from "../receipts/schema";
import { useWorkflowStore } from "../state/workflowStore";

function referenceExists(workflow: WorkflowState, reference: ApplicationReference): boolean {
  if (reference.kind === "workflow-node") {
    return workflow.nodes.some((node) => node.id === reference.id);
  }
  if (reference.kind === "workflow-edge") {
    return workflow.edges.some((edge) => edge.id === reference.id);
  }
  return false;
}

function unavailableLabel(receipt: ChangeReceipt, reference: ApplicationReference) {
  const action = receipt.changes.find(
    (change) => change.object.kind === reference.kind && change.object.id === reference.id,
  )?.action;
  if (action === "deleted") return "Deleted";
  if (action === "disconnected") return "Disconnected";
  return "Unavailable";
}

type ChangeCardProps = {
  receipt: ChangeReceipt;
  workflow: WorkflowState;
  reviewed: boolean;
  onMarkReviewed: () => void;
  onReveal: (reference: ApplicationReference) => void;
  onUndo: () => void;
};

function ChangeCard({
  receipt,
  workflow,
  reviewed,
  onMarkReviewed,
  onReveal,
  onUndo,
}: ChangeCardProps) {
  const affectedObjects = receipt.affected.filter(
    (reference) => reference.kind !== "change-receipt",
  );

  return (
    <article
      id={`change-${receipt.operationId}`}
      aria-labelledby={changeHeadingId(receipt.operationId)}
      className="change-card"
    >
      <div className="change-topline">
        <span className={`status-pill status-pill--${receipt.status}`}>{receipt.status}</span>
        <span className="review-state">{reviewed ? "Reviewed" : "Unreviewed"}</span>
      </div>

      <h3 tabIndex={-1} id={changeHeadingId(receipt.operationId)}>
        {receipt.summary}
      </h3>

      {receipt.validation.problems.length > 0 ? (
        <div className={`problems${receipt.validation.valid ? "" : " problems--error"}`}>
          <h4>{receipt.validation.valid ? "Warnings" : "Needs attention"}</h4>
          <ul>
            {receipt.validation.problems.map((problem, index) => (
              <li key={`${problem.code}-${index}`}>{problem.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="change-footer">
        {affectedObjects.length > 0 ? (
          <div className="affected" aria-label="Affected objects">
            {affectedObjects.map((reference) => referenceExists(workflow, reference) ? (
              <button
                key={`${reference.kind}-${reference.id}`}
                onClick={() => onReveal(reference)}
              >
                Reveal {reference.label}
              </button>
            ) : (
              <span className="removed-object" key={`${reference.kind}-${reference.id}`}>
                {unavailableLabel(receipt, reference)} {reference.label}
              </span>
            ))}
          </div>
        ) : null}

        <div className="change-actions">
          <button onClick={onMarkReviewed} disabled={reviewed}>
            {reviewed ? "Reviewed" : "Mark reviewed"}
          </button>
          {receipt.undo.available ? (
            <button className="undo-button" onClick={onUndo}>Undo</button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ChangeHistory() {
  const history = useWorkflowStore((state) => state.history);
  const workflow = useWorkflowStore((state) => state.workflow);
  const reviewed = useWorkflowStore((state) => state.reviewed);
  const select = useWorkflowStore((state) => state.select);
  const markReviewed = useWorkflowStore((state) => state.markReviewed);
  const undo = useWorkflowStore((state) => state.undo);
  const reportError = useWorkflowStore((state) => state.reportError);

  const reveal = (reference: ApplicationReference) => {
    const kind = reference.kind === "workflow-node" ? "node" : reference.kind === "workflow-edge" ? "edge" : null;
    if (!kind || !referenceExists(workflow, reference)) {
      reportError(`${reference.label} no longer exists in the current workflow.`);
      return;
    }
    select({ kind, id: reference.id }, undefined, true);
  };

  const runUndo = (operationId: string) => {
    try {
      undo(operationId);
      queueMicrotask(() => document.getElementById(changeHeadingId(operationId))?.focus());
    } catch (error) {
      reportError(error instanceof Error ? error.message : "Undo failed.");
    }
  };

  return (
    <section className="history" aria-labelledby="change-history-heading">
      <div className="history-heading">
        <h2 id="change-history-heading">Change history</h2>
      </div>

      {history.length === 0 ? (
        <div className="empty-history"><p>No changes yet.</p></div>
      ) : (
        <ol className="history-list">
          {history.map((receipt) => (
            <li key={receipt.operationId}>
              <ChangeCard
                receipt={receipt}
                workflow={workflow}
                reviewed={reviewed.includes(receipt.operationId)}
                onMarkReviewed={() => markReviewed(receipt.operationId)}
                onReveal={reveal}
                onUndo={() => runUndo(receipt.operationId)}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
