import type { WorkflowCommandInput, WorkflowCreationInput } from "./toolSchemas";
import creationPorts from "../graph/creationPorts.json";
import { createUniqueId } from "../graph/identifiers";
import { nodeDefinitions } from "../graph/nodeTypes";
import { ToolError } from "./errors";

function reserveUniqueId(value: string, usedIds: Set<string>, fallback: string) {
  const id = createUniqueId(value, usedIds, fallback);
  usedIds.add(id);
  return id;
}

function sourcePortFor(
  source: WorkflowCreationInput["nodes"][number],
  requestedPort: string | undefined,
) {
  const outputs = nodeDefinitions[source.type].outputs;
  const inferredPort = creationPorts[source.type].output ?? undefined;
  const port = requestedPort ?? inferredPort;
  if (!port || !outputs.includes(port)) {
    throw new ToolError(
      "INVALID_CREATION",
      `${source.label} requires 'on' to name one of its output ports: ${outputs.join(", ") || "none"}.`,
    );
  }
  return port;
}

export function commandsForWorkflowCreation(input: WorkflowCreationInput): WorkflowCommandInput[] {
  const usedNodeIds = new Set<string>();
  const nodesByKey = new Map(input.nodes.map((node) => [node.key, {
    input: node,
    id: reserveUniqueId(node.label, usedNodeIds, "node"),
  }]));
  const usedEdgeIds = new Set<string>();
  const commands: WorkflowCommandInput[] = input.nodes.map((node) => {
    const created = nodesByKey.get(node.key)!;
    return {
      type: "createNode",
      node: {
        id: created.id,
        type: node.type,
        label: node.label,
        ...(node.properties === undefined ? {} : { properties: node.properties }),
      },
    };
  });

  for (const connection of input.connections) {
    const source = nodesByKey.get(connection.from);
    const target = nodesByKey.get(connection.to);
    if (!source || !target) {
      const missingKey = !source ? connection.from : connection.to;
      throw new ToolError("INVALID_CREATION", `Connection references unknown node key '${missingKey}'.`);
    }
    const targetPort = creationPorts[target.input.type].input;
    if (!targetPort || !nodeDefinitions[target.input.type].inputs.includes(targetPort)) {
      throw new ToolError("INVALID_CREATION", `${target.input.label} cannot receive a workflow connection.`);
    }
    const sourcePort = sourcePortFor(source.input, connection.on);
    commands.push({
      type: "connect",
      edge: {
        id: reserveUniqueId(`edge-${source.id}-${sourcePort}-${target.id}`, usedEdgeIds, "edge"),
        source: { nodeId: source.id, port: sourcePort },
        target: { nodeId: target.id, port: targetPort },
        ...(connection.label === undefined ? {} : { label: connection.label }),
      },
    });
  }
  return commands;
}
