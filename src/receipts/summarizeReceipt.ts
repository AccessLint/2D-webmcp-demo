import type { WorkflowChange } from "./schema";

export function summarizeChanges(changes: WorkflowChange[], valid: boolean, undo = false) {
  const nodes = changes.filter((change) => change.object.kind === "workflow-node");
  const connections = changes.filter((change) => change.object.kind === "workflow-edge");
  const createdNode = nodes.find((change) => change.action === "created")?.object.label;
  const parts: string[] = [];
  if (undo) parts.push("Undid the previous workflow change");
  else if (createdNode) parts.push(`Created ${createdNode}`);
  else if (nodes.length) parts.push(`Changed ${nodes.length} ${nodes.length === 1 ? "node" : "nodes"}`);
  if (connections.length) parts.push(`${undo || parts.length === 0 ? "restored" : "changed"} ${connections.length} ${connections.length === 1 ? "connection" : "connections"}`);
  const lead = parts.length ? parts.join(" and ") : "Updated workflow";
  return `${lead}. Workflow validation ${valid ? "passed" : "has errors"}.`;
}
