import { useEffect, useRef } from "react";
import { relationshipsForNode } from "../graph/selectors";
import { useWorkflowStore } from "../state/workflowStore";

export function NodeInspector() {
  const workflow = useWorkflowStore((state) => state.workflow);
  const selected = useWorkflowStore((state) => state.selected);
  const returnFocusId = useWorkflowStore((state) => state.returnFocusId);
  const focusRequest = useWorkflowStore((state) => state.focusRequest);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focusRequest) headingRef.current?.focus(); }, [focusRequest]);
  if (!selected) return <section className="panel inspector"><h2>Inspector</h2><p>Select a node or connection.</p></section>;
  if (selected.kind === "edge") {
    const edge = workflow.edges.find((item) => item.id === selected.id);
    if (!edge) return <section className="panel inspector"><h2>Connection unavailable</h2></section>;
    const source = workflow.nodes.find((node) => node.id === edge.source)!;
    const target = workflow.nodes.find((node) => node.id === edge.target)!;
    return <section className="panel inspector" aria-labelledby="edge-inspector-heading"><p className="eyebrow">Connection inspector</p><h2 tabIndex={-1} ref={headingRef} id="edge-inspector-heading">{source.label} to {target.label}</h2><dl><div><dt>Outcome</dt><dd>{edge.sourcePort}</dd></div><div><dt>Target input</dt><dd>{edge.targetPort}</dd></div><div><dt>Stable ID</dt><dd><code>{edge.id}</code></dd></div></dl>{returnFocusId ? <button className="text-button" onClick={() => document.getElementById(returnFocusId)?.focus()}>← Return to change</button> : null}</section>;
  }
  const node = workflow.nodes.find((item) => item.id === selected.id);
  if (!node) return <section className="panel inspector"><h2>Node unavailable</h2></section>;
  const relationships = relationshipsForNode(workflow, node.id);
  return <section className="panel inspector" aria-labelledby="node-inspector-heading">
    <p className="eyebrow">{node.type} inspector</p><h2 tabIndex={-1} ref={headingRef} id="node-inspector-heading">{node.label} node</h2>
    <dl>
      <div><dt>Type</dt><dd>{node.type}</dd></div>
      <div><dt>Stable ID</dt><dd><code>{node.id}</code></dd></div>
      {Object.entries(node.properties).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>)}
    </dl>
    <h3>Relationships</h3>
    {relationships.length ? <ul className="relationship-list">{relationships.map(({ edge, direction, other }) => <li key={edge.id}><span className={`direction direction--${direction}`}>{direction}</span><strong>{direction === "outgoing" ? edge.sourcePort : edge.targetPort}</strong><span aria-hidden="true">→</span><span>{other.label}</span></li>)}</ul> : <p>No connections.</p>}
    {returnFocusId ? <button className="text-button" onClick={() => document.getElementById(returnFocusId)?.focus()}>← Return to change</button> : null}
  </section>;
}
