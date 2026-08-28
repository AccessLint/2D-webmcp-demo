import { useMemo, useState } from "react";
import { workflowStore, useWorkflowStore } from "../state/workflowStore";
import { createToolHandlers } from "../webmcp/toolHandlers";

export function ToolDevPanel({ nativeSupported }: { nativeSupported: boolean }) {
  const workflow = useWorkflowStore((state) => state.workflow);
  const selected = useWorkflowStore((state) => state.selected);
  const history = useWorkflowStore((state) => state.history);
  const invocations = useWorkflowStore((state) => state.invocations);
  const reset = useWorkflowStore((state) => state.reset);
  const reportError = useWorkflowStore((state) => state.reportError);
  const [output, setOutput] = useState("Ready.");
  const tools = useMemo(() => createToolHandlers(workflowStore), []);
  const runDemo = () => {
    try {
      const receipt = tools.apply_workflow_changes({ baseRevision: workflow.revision, intent: "Add a Retry step after Fetch Orders. Try three times. Continue to Save Results on success and send failures to Alert Team.", commands: [
        { type: "createNode", node: { id: "retry", type: "retry", label: "Retry", position: { x: 525, y: 245 }, properties: { attempts: 3 } } },
        { type: "replaceConnection", edgeId: "edge-fetch-save", replacement: [
          { id: "edge-fetch-retry", source: "fetch-orders", sourcePort: "success", target: "retry", targetPort: "input" },
          { id: "edge-retry-save", source: "retry", sourcePort: "success", target: "save-results", targetPort: "input" },
          { id: "edge-retry-alert", source: "retry", sourcePort: "failure", target: "alert-team", targetPort: "input" },
        ] },
      ] });
      setOutput(JSON.stringify(receipt, null, 2));
    } catch (error) { const message = error instanceof Error ? error.message : "Demo failed."; reportError(message); setOutput(message); }
  };
  const runStaleDemo = () => {
    const receipt = tools.apply_workflow_changes({ baseRevision: workflow.revision + 1, intent: "Demonstrate stale agent context", commands: [{ type: "updateNode", id: "fetch-orders", patch: { label: "Fetch Orders" } }] });
    setOutput(JSON.stringify(receipt, null, 2));
  };
  const show = (task: () => unknown) => { try { setOutput(JSON.stringify(task(), null, 2)); } catch (error) { const message = error instanceof Error ? error.message : "Tool call failed."; reportError(message); setOutput(message); } };
  return <aside className="tool-panel" aria-labelledby="tool-panel-heading">
    <div><p className="eyebrow">Agent interface</p><h2 id="tool-panel-heading">WebMCP tools</h2><p className={`support ${nativeSupported ? "is-native" : ""}`}><span aria-hidden="true">●</span>{nativeSupported ? "Native tools registered" : "Development fallback active"}</p></div>
    <p>Both paths call the same application handlers and produce the same receipts.</p>
    <div className="demo-prompt"><span>Demo request</span><p>“Add a Retry step after Fetch Orders. Try three times…”</p></div>
    <div className="tool-actions"><button className="primary-button" onClick={runDemo} disabled={workflow.nodes.some((node) => node.id === "retry")}>Run Retry demo</button><button onClick={reset}>Reset workflow</button></div>
    <button className="stale-button" onClick={runStaleDemo}>Record stale-revision example</button>
    <div className="fallback-tools" aria-label="Development tool controls">
      <button onClick={() => show(() => tools.get_workflow_summary({}))}>Get summary</button>
      <button disabled={!selected} onClick={() => selected && show(() => tools.inspect_workflow_objects({ objects: [{ kind: selected.kind === "node" ? "workflow-node" : "workflow-edge", id: selected.id }] }))}>Inspect selected</button>
      <button disabled={!selected} onClick={() => selected && show(() => tools.reveal_workflow_object({ kind: selected.kind === "node" ? "workflow-node" : "workflow-edge", id: selected.id }))}>Reveal selected</button>
      <button disabled={!history.length} onClick={() => history[0] && show(() => tools.get_change_receipt({ operationId: history[0].operationId }))}>Get latest receipt</button>
      <button disabled={!history.some((receipt) => receipt.undo.available)} onClick={() => { const receipt = history.find((item) => item.undo.available); if (receipt) show(() => tools.undo_workflow_change({ operationId: receipt.operationId })); }}>Undo latest change</button>
    </div>
    <details><summary>Last structured result</summary><pre>{output}</pre></details>
    {invocations.length ? <div className="invocations"><h3>Invocation log</h3><ul>{invocations.map((item) => <li key={item.id}><code>{item.tool}</code><span>{item.outcome}</span></li>)}</ul></div> : null}
  </aside>;
}
