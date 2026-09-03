import type { WorkflowChange } from "./schema";

export function summarizeChanges(changes: WorkflowChange[], undo = false) {
  const nodes = changes.filter((change) => change.object.kind === "workflow-node");
  const connections = changes.filter((change) => change.object.kind === "workflow-edge");
  const createdNode = nodes.find((change) => change.action === "created")?.object.label;
  const renamedNode = nodes.length === 1 && connections.length === 0
    ? nodes.find((change) => {
      if (
        change.action !== "updated"
        || !change.before
        || !change.after
        || !("type" in change.before)
        || !("type" in change.after)
        || change.before.label === change.after.label
      ) return false;
      return JSON.stringify({ ...change.before, label: undefined })
        === JSON.stringify({ ...change.after, label: undefined });
    })
    : undefined;
  const parts: string[] = [];
  if (undo) parts.push("Undid the previous workflow change");
  else if (createdNode) parts.push(`Created ${createdNode}`);
  else if (renamedNode?.before && renamedNode.after) {
    parts.push(`Renamed ${renamedNode.before.label} to ${renamedNode.after.label}`);
  }
  else if (nodes.length) parts.push(`Changed ${nodes.length} ${nodes.length === 1 ? "node" : "nodes"}`);
  if (connections.length) {
    const verb = undo ? "restored" : parts.length === 0 ? "Changed" : "changed";
    parts.push(`${verb} ${connections.length} ${connections.length === 1 ? "connection" : "connections"}`);
  }
  const lead = parts.length ? parts.join(" and ") : "Updated workflow";
  return `${lead}.`;
}
