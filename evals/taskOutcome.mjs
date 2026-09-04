function callsFrom(results) {
  return results
    .map((result) => result.response)
    .filter((response) => response && typeof response.functionName === "string");
}

function inputFor(call) {
  return call.args || call.arguments || {};
}

function isCompletedMutation(call) {
  const input = inputFor(call);
  const result = call.result;
  const baseRevision = Number.isInteger(input.baseRevision) ? input.baseRevision : result?.baseRevision;
  return ["create_workflow", "edit_workflow"].includes(call.functionName)
    && result?.status === "completed"
    && typeof result.operationId === "string"
    && Number.isInteger(baseRevision)
    && result.baseRevision === baseRevision
    && result.resultingRevision === baseRevision + 1
    && Number.isInteger(result.changeCount)
    && result.changeCount > 0;
}

function commandsForMutation(call) {
  const input = inputFor(call);
  if (call.functionName === "edit_workflow") return input.commands;
  if (call.functionName !== "create_workflow"
    || !Array.isArray(input.nodes)
    || !Array.isArray(input.connections)) return null;
  const nodesByKey = new Map(input.nodes.map((node) => [node?.key, node]));
  const createdNodes = input.nodes.map((node) => ({
    type: "createNode",
    node: { id: node?.key, type: node?.type, label: node?.label },
  }));
  const connections = input.connections.map((connection, index) => {
    const source = nodesByKey.get(connection?.from);
    const target = nodesByKey.get(connection?.to);
    return {
      type: "connect",
      edge: {
        id: `connection-${String(index)}`,
        source: { nodeId: connection?.from, port: connection?.on || creationPorts[source?.type]?.output },
        target: { nodeId: connection?.to, port: creationPorts[target?.type]?.input },
      },
    };
  });
  return [...createdNodes, ...connections];
}

function labelValue(label) {
  return typeof label === "string" ? label : label?.value;
}

function edgeEndpoint(edge, side) {
  const endpoint = edge?.[side];
  return {
    nodeId: typeof endpoint === "object" ? endpoint?.nodeId : undefined,
    port: typeof endpoint === "object" ? endpoint?.port : undefined,
  };
}

function createdGraphFrom(commands) {
  if (!Array.isArray(commands) || commands.some((command) =>
    !["createNode", "connect"].includes(command?.type))) return null;
  const createdNodes = commands.filter((command) => command.type === "createNode");
  const connections = commands.filter((command) => command.type === "connect");
  return {
    createdNodes,
    connections,
    nodeByLabel: new Map(createdNodes.map((command) => [
      String(labelValue(command.node?.label) || "").toLowerCase(),
      command.node,
    ])),
  };
}

function isNotificationEdit(commands) {
  const graph = createdGraphFrom(commands);
  if (!graph) return false;
  const { createdNodes, connections } = graph;
  if (createdNodes.length !== 1 || connections.length !== 1) return false;
  const notification = createdNodes[0].node;
  const edge = connections[0].edge;
  const source = edgeEndpoint(edge, "source");
  const target = edgeEndpoint(edge, "target");
  return notification?.type === "action"
    && String(labelValue(notification.label) || "").toLowerCase() === "notify requester"
    && source.nodeId === "approve-request"
    && source.port === "success"
    && target.port === "input"
    && target.nodeId === notification.id;
}

function isCreateApprovalEdit(commands) {
  const graph = createdGraphFrom(commands);
  if (!graph) return false;
  const { createdNodes, connections, nodeByLabel } = graph;
  if (createdNodes.length !== 2 || connections.length !== 1) return false;
  const draft = nodeByLabel.get("draft request");
  const approve = nodeByLabel.get("approve request");
  const edge = connections[0].edge;
  const source = edgeEndpoint(edge, "source");
  const target = edgeEndpoint(edge, "target");
  return Boolean(draft && approve
    && source.nodeId === draft.id
    && source.port === "success"
    && target.nodeId === approve.id
    && target.port === "input");
}

function isComplexBranchCreate(commands) {
  const graph = createdGraphFrom(commands);
  if (!graph) return false;
  const { createdNodes, connections } = graph;
  if (createdNodes.length < 8 || connections.length < createdNodes.length - 1) return false;
  const nodes = createdNodes.map((command) => command.node);
  const labels = nodes.map((node) => String(labelValue(node?.label) || "").toLowerCase());
  const requiredConcepts = [
    /report|intake/,
    /duplicat|dedup/,
    /reproduc/,
    /severity/,
    /priorit/,
    /owner|assign/,
    /investigat|diagnos/,
    /fix|repair|remediat/,
    /verif|test|\bqa\b/,
    /releas|deploy/,
    /clos|resolv/,
    /block/,
    /regress/,
    /follow.?up/,
  ];
  if (requiredConcepts.some((concept) => !labels.some((label) => concept.test(label)))) return false;
  const meaningfulNodeIndexes = new Set(labels.flatMap((label, index) => (
    requiredConcepts.some((concept) => concept.test(label)) ? [index] : []
  )));
  if (meaningfulNodeIndexes.size < 8) return false;
  if (!nodes.some((node) => node?.type === "input")
    || !nodes.some((node) => node?.type === "end")
    || nodes.filter((node) => node?.type === "condition").length < 2) return false;

  const nodeIds = new Set(nodes.map((node) => node?.id));
  const outgoing = new Map([...nodeIds].map((id) => [id, []]));
  const incoming = new Map([...nodeIds].map((id) => [id, []]));
  const undirected = new Map([...nodeIds].map((id) => [id, []]));
  for (const command of connections) {
    const source = edgeEndpoint(command.edge, "source").nodeId;
    const target = edgeEndpoint(command.edge, "target").nodeId;
    if (!nodeIds.has(source) || !nodeIds.has(target)) return false;
    outgoing.get(source).push(target);
    incoming.get(target).push(source);
    undirected.get(source).push(target);
    undirected.get(target).push(source);
  }
  const visit = (startingIds, adjacency) => {
    const visited = new Set(startingIds);
    const pending = [...startingIds];
    while (pending.length > 0) {
      for (const id of adjacency.get(pending.shift()) || []) {
        if (!visited.has(id)) {
          visited.add(id);
          pending.push(id);
        }
      }
    }
    return visited;
  };
  const inputs = nodes.filter((node) => node.type === "input").map((node) => node.id);
  const ends = nodes.filter((node) => node.type === "end").map((node) => node.id);
  const branchingConditions = nodes.filter((node) => node.type === "condition"
    && new Set(outgoing.get(node.id)).size >= 2);
  return visit([nodes[0].id], undirected).size === nodeIds.size
    && visit(inputs, outgoing).size === nodeIds.size
    && visit(ends, incoming).size === nodeIds.size
    && branchingConditions.length >= 2;
}

function isConnectionReroute(commands) {
  if (!Array.isArray(commands) || commands.length !== 2) return false;
  const disconnect = commands.find((command) => command?.type === "disconnect");
  const connect = commands.find((command) => command?.type === "connect");
  if (disconnect?.edgeId !== "edge-receive-archive" || !connect?.edge) return false;
  const edge = connect.edge;
  const source = edgeEndpoint(edge, "source");
  const target = edgeEndpoint(edge, "target");
  return source.nodeId === "receive-request"
    && source.port === "success"
    && target.nodeId === "manual-review"
    && target.port === "input";
}

function isPaginatedRoutingHubEdit(commands) {
  if (!Array.isArray(commands) || commands.length !== 1) return false;
  const command = commands[0];
  return command?.type === "updateNode"
    && command.id === "routing-hub"
    && command.patch
    && Object.keys(command.patch).length === 1
    && String(labelValue(command.patch.label) || "").toLowerCase() === "reviewed routing hub";
}

const outcomeValidators = Object.freeze({
  "notification-edit": isNotificationEdit,
  "approval-create": isCreateApprovalEdit,
  "complex-branch-create": isComplexBranchCreate,
  "connection-reroute": isConnectionReroute,
  "paginated-routing-hub-edit": isPaginatedRoutingHubEdit,
});

export const supportedOutcomeTypes = Object.freeze(Object.keys(outcomeValidators));

export function isSupportedOutcomeType(value) {
  return typeof value === "string" && Object.hasOwn(outcomeValidators, value);
}

export function hasVerifiedTaskOutcome(attempt, trajectorySuccessful) {
  if (!trajectorySuccessful || (attempt.taskType !== "create" && attempt.taskType !== "edit")) {
    return trajectorySuccessful;
  }
  const calls = callsFrom(attempt.results);
  const completedEdits = calls.filter(isCompletedMutation);
  const outcomeType = attempt.outcomeType || (attempt.taskType === "create"
    ? "approval-create"
    : "notification-edit");
  if (completedEdits.length !== 1) return false;
  const editCall = completedEdits[0];
  const editIndex = calls.indexOf(editCall);
  const wasUndone = calls.some((call, index) => index > editIndex
    && call.functionName === "undo_workflow_edit"
    && inputFor(call).operationId === editCall.result?.operationId
    && call.result?.status === "completed");
  if (wasUndone) return false;
  const commands = commandsForMutation(editCall);
  return isSupportedOutcomeType(outcomeType) && outcomeValidators[outcomeType](commands);
}
import creationPorts from "../src/graph/creationPorts.json" with { type: "json" };
