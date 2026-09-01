import { useEffect, useState } from "react";
import { ChangeHistory } from "../components/ChangeHistory";
import { EvalResultsPage } from "../components/EvalResultsPage";
import { LiveStatus } from "../components/LiveStatus";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { workflowStore, useWorkflowStore } from "../state/workflowStore";
import { registerWorkflowTools } from "../webmcp/registerTools";
import { createToolHandlers } from "../webmcp/toolHandlers";
import { parseWorkflowHash } from "./routes";

const demoPrompt = "Inspect the lead qualification workflow. Add an Action named Notify sales after Create CRM opportunity, reconnect it to Complete, then show me the edit result.";

function WorkflowDemo() {
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
        <nav className="site-nav" aria-label="Primary">
          <a href="/" aria-current="page">WebMCP demo</a>
          <a href="/evals">Evaluation history</a>
        </nav>
        <header className="demo-intro">
          <h1>Verifiable workflow editing with WebMCP</h1>
          <p>
            This demo shows an agent editing the same workflow as the human interface while the
            application records an inspectable change receipt. The complete review flow is keyboard
            accessible, and accessibility for screen reader users is a primary design goal. Flows use
            just three types—Node, Action, and Condition—with entry and completion points inferred
            from their connections.
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

export default function App() {
  return window.location.pathname.replace(/\/$/, "") === "/evals"
    ? <EvalResultsPage />
    : <WorkflowDemo />;
}
