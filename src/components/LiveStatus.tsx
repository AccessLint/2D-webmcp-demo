import { useWorkflowStore } from "../state/workflowStore";

export function LiveStatus() {
  const polite = useWorkflowStore((state) => state.politeMessage);
  const assertive = useWorkflowStore((state) => state.assertiveMessage);
  return <><div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{polite}</div><div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{assertive}</div></>;
}
