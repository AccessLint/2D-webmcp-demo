import { useWorkflowStore } from "../state/workflowStore";

export function ConnectionList() {
  const workflow = useWorkflowStore((state) => state.workflow);
  const select = useWorkflowStore((state) => state.select);
  return <section className="panel connections" aria-labelledby="connections-heading"><div className="panel-heading"><div><p className="eyebrow">Semantic routes</p><h2 id="connections-heading">Connections</h2></div><span className="count">{workflow.edges.length}</span></div>
    <ul>{workflow.edges.map((edge) => {
      const source = workflow.nodes.find((node) => node.id === edge.source)!;
      const target = workflow.nodes.find((node) => node.id === edge.target)!;
      return <li key={edge.id}><button onClick={() => select({ kind: "edge", id: edge.id })} aria-label={`Inspect connection from ${source.label} via ${edge.sourcePort} to ${target.label}`}><strong>{source.label}</strong><span className="route">{edge.sourcePort}<span aria-hidden="true">→</span></span><strong>{target.label}</strong></button></li>;
    })}</ul>
  </section>;
}
