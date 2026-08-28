import { useMemo, useState } from "react";
import { useWorkflowStore } from "../state/workflowStore";

export function NodeOutline() {
  const nodes = useWorkflowStore((state) => state.workflow.nodes);
  const selected = useWorkflowStore((state) => state.selected);
  const select = useWorkflowStore((state) => state.select);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => nodes.filter((node) => `${node.label} ${node.type}`.toLowerCase().includes(query.toLowerCase())), [nodes, query]);
  return <section className="panel outline" aria-labelledby="outline-heading">
    <div className="panel-heading"><div><p className="eyebrow">Semantic view</p><h2 id="outline-heading">Workflow outline</h2></div><span className="count">{nodes.length}</span></div>
    <label className="search-label">Find a node<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes" /></label>
    <ol className="node-list">
      {filtered.map((node, index) => <li key={node.id} className={selected?.kind === "node" && selected.id === node.id ? "is-current" : ""}>
        <button id={`outline-${node.id}`} onClick={() => select({ kind: "node", id: node.id }, `outline-${node.id}`, true)} aria-label={`Inspect ${node.label}`}>
          <span className="node-index">{String(index + 1).padStart(2, "0")}</span><span><strong>{node.label}</strong><small>{node.type}</small></span><span aria-hidden="true">→</span>
        </button>
      </li>)}
    </ol>
  </section>;
}
