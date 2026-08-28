import { useEffect } from "react";
import { ChangeHistory } from "../components/ChangeHistory";
import { LiveStatus } from "../components/LiveStatus";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { workflowStore, useWorkflowStore } from "../state/workflowStore";
import { registerWorkflowTools } from "../webmcp/registerTools";
import { createToolHandlers } from "../webmcp/toolHandlers";
import { parseWorkflowHash } from "./routes";

export default function App() {
  const select = useWorkflowStore((state) => state.select);
  useEffect(() => {
    const registration = registerWorkflowTools(createToolHandlers(workflowStore));
    return registration.unregister;
  }, []);
  useEffect(() => {
    const revealHash = () => { const target = parseWorkflowHash(window.location.hash); if (target) select(target, undefined, true); };
    window.addEventListener("hashchange", revealHash); revealHash();
    return () => window.removeEventListener("hashchange", revealHash);
  }, [select]);
  return <div className="app-shell">
    <LiveStatus />
    <main id="workspace">
      <h1 className="sr-only">Workflow editor</h1>
      <div className="workbench"><WorkflowCanvas /></div>
      <ChangeHistory />
    </main>
  </div>;
}
