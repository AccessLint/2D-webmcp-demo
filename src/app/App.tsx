import { useEffect, useState } from "react";
import { ChangeHistory } from "../components/ChangeHistory";
import { LiveStatus } from "../components/LiveStatus";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { workflowStore, useWorkflowStore } from "../state/workflowStore";
import { registerWorkflowTools } from "../webmcp/registerTools";
import { createToolHandlers } from "../webmcp/toolHandlers";
import { parseWorkflowHash } from "./routes";

const demoPrompt = "Inspect the workflow. Add a Retry node with three attempts after Fetch Orders, route Retry success to Save Results and Retry failure to Alert Team, and then show me the edit result.";

export default function App() {
  const select = useWorkflowStore((state) => state.select);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copyDemoPrompt = async () => {
    try {
      await navigator.clipboard.writeText(demoPrompt);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };
  useEffect(() => {
    const registration = registerWorkflowTools(createToolHandlers(workflowStore));
    void registration.ready.catch(() => {
      workflowStore.getState().reportError("WebMCP tools could not be registered. Reload the page and try again.");
    });
    return registration.unregister;
  }, []);
  useEffect(() => {
    const revealHash = () => {
      const target = parseWorkflowHash(window.location.hash);
      if (target) select(target, undefined, true);
    };
    window.addEventListener("hashchange", revealHash);
    revealHash();
    return () => window.removeEventListener("hashchange", revealHash);
  }, [select]);

  return (
    <div className="app-shell">
      <LiveStatus />
      <main id="workspace" tabIndex={-1}>
        <header className="demo-intro">
          <h1>Verifiable workflow editing with WebMCP</h1>
          <p>
            This demo shows an agent editing the same workflow as the human interface while the
            application records an inspectable change receipt. The complete review flow is keyboard
            accessible, and accessibility for screen reader users is a primary design goal.
          </p>
          <div className="demo-prompt">
            <div className="demo-prompt__heading">
              <h2>Try this prompt</h2>
              <button
                type="button"
                onClick={() => void copyDemoPrompt()}
              >
                {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy prompt"}
              </button>
            </div>
            <blockquote>{demoPrompt}</blockquote>
          </div>
        </header>
        <div className="workbench">
          <WorkflowCanvas />
        </div>
        <ChangeHistory />
      </main>
    </div>
  );
}
