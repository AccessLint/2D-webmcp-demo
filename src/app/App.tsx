import { useEffect, useState } from "react";
import { ChangeHistory } from "../components/ChangeHistory";
import { ConnectionList } from "../components/ConnectionList";
import { LiveStatus } from "../components/LiveStatus";
import { NodeInspector } from "../components/NodeInspector";
import { NodeOutline } from "../components/NodeOutline";
import { ToolDevPanel } from "../components/ToolDevPanel";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { workflowStore, useWorkflowStore } from "../state/workflowStore";
import { registerWorkflowTools } from "../webmcp/registerTools";
import { createToolHandlers } from "../webmcp/toolHandlers";
import { parseWorkflowHash } from "./routes";

export default function App() {
  const workflow = useWorkflowStore((state) => state.workflow);
  const select = useWorkflowStore((state) => state.select);
  const [nativeSupported, setNativeSupported] = useState(false);
  useEffect(() => {
    const registration = registerWorkflowTools(createToolHandlers(workflowStore));
    setNativeSupported(registration.supported);
    return registration.unregister;
  }, []);
  useEffect(() => {
    const revealHash = () => { const target = parseWorkflowHash(window.location.hash); if (target) select(target, undefined, true); };
    window.addEventListener("hashchange", revealHash); revealHash();
    return () => window.removeEventListener("hashchange", revealHash);
  }, [select]);
  return <div className="app-shell">
    <LiveStatus />
    <header className="app-header"><div className="brand-mark" aria-hidden="true">W</div><div><p>Accessible agent actions</p><h1>Workflow evidence lab</h1></div><div className="revision-badge"><span>Current revision</span><strong>{workflow.revision}</strong></div></header>
    <main id="workspace">
      <section className="hero" aria-labelledby="hero-heading"><div><p className="eyebrow">Inspect what changed, not just what was claimed</p><h2 id="hero-heading">A node editor with receipts you can verify.</h2><p>Every human and agent edit passes through one authoritative workflow model. Review the application’s evidence, inspect exact objects, and undo safely.</p></div><div className="principle"><span aria-hidden="true">↳</span><p><strong>The agent states its intent.</strong><br />The application reports the result.</p></div></section>
      <div className="workbench"><div className="canvas-column"><div className="canvas-toolbar"><div><span className="pulse" aria-hidden="true"></span>Workflow live</div><p>{workflow.nodes.length} nodes · {workflow.edges.length} connections</p></div><WorkflowCanvas /></div><ToolDevPanel nativeSupported={nativeSupported} /></div>
      <div className="semantic-grid"><NodeOutline /><NodeInspector /><ConnectionList /></div>
      <ChangeHistory />
    </main>
    <footer><p>Application facts remain separate from agent-supplied intent.</p><span>Receipt schema 0.1</span></footer>
  </div>;
}
