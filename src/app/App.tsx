import { useEffect, useState } from "react";
import evalCases from "../../evals/webmcp-evals.json";
import { ChangeHistory } from "../components/ChangeHistory";
import { EvalResultsPage } from "../components/EvalResultsPage";
import { LiveStatus } from "../components/LiveStatus";
import { RealRunTraceControls } from "../components/RealRunTraceControls";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { workflowStore, useWorkflowStore } from "../state/workflowStore";
import { registerWorkflowTools } from "../webmcp/registerTools";
import { createToolHandlers } from "../webmcp/toolHandlers";
import { parseWorkflowHash } from "./routes";

const matchingEvalCase = "Create a complex multi-branch bug workflow";
const matchingEvalPrompt = (() => {
  const prompt = evalCases.find((evalCase) => evalCase.name === matchingEvalCase)?.messages[0]?.content;
  if (!prompt) throw new Error(`Eval case ${matchingEvalCase} is missing its prompt.`);
  return prompt;
})();
const demoPrompt = matchingEvalPrompt;

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
          <h1>2D WebMCP - Agent-friendly, accessible canvas editor</h1>
          <p>Work with a mouse, keyboard, or AI agent to create complex workflows.</p>
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
            <RealRunTraceControls caseName={matchingEvalCase} prompt={matchingEvalPrompt} />
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
