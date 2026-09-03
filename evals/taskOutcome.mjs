function callsFrom(results) {
  return results
    .map((result) => result.response)
    .filter((response) => response && typeof response.functionName === "string");
}

function inputFor(call) {
  return call.args || call.arguments || {};
}

function isCompletedEdit(call) {
  const input = inputFor(call);
  const result = call.result;
  return call.functionName === "edit_workflow"
    && result?.status === "completed"
    && typeof result.operationId === "string"
    && Number.isInteger(input.baseRevision)
    && result.baseRevision === input.baseRevision
    && result.resultingRevision === input.baseRevision + 1
    && Number.isInteger(result.changeCount)
    && result.changeCount > 0
    && result.nextCall?.tool === "show_edit_result"
    && result.nextCall?.input?.operationId === result.operationId;
}

function labelValue(label) {
  return typeof label === "string" ? label : label?.value;
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

function matchingReceiptWasShown(calls, editCall) {
  return calls.some((call) => call.functionName === "show_edit_result"
    && inputFor(call).operationId === editCall.result?.operationId
    && call.result?.visible === true
    && call.result?.status === "completed");
}

function isNotificationEdit(commands) {
  const graph = createdGraphFrom(commands);
  if (!graph) return false;
  const { createdNodes, connections } = graph;
  if (createdNodes.length !== 1 || connections.length !== 1) return false;
  const notification = createdNodes[0].node;
  const edge = connections[0].edge;
  return notification?.type === "action"
    && String(labelValue(notification.label) || "").toLowerCase() === "notify requester"
    && edge?.source === "approve-request"
    && edge.sourcePort === "success"
    && edge.targetPort === "input"
    && edge.target === notification.id;
}

function isCreateApprovalEdit(commands) {
  const graph = createdGraphFrom(commands);
  if (!graph) return false;
  const { createdNodes, connections, nodeByLabel } = graph;
  if (createdNodes.length !== 2 || connections.length !== 1) return false;
  const draft = nodeByLabel.get("draft request");
  const approve = nodeByLabel.get("approve request");
  const edge = connections[0].edge;
  return Boolean(draft && approve
    && edge?.source === draft.id
    && edge.sourcePort === "success"
    && edge.target === approve.id
    && edge.targetPort === "input");
}

function isComplexBranchCreate(commands) {
  const graph = createdGraphFrom(commands);
  if (!graph) return false;
  const { createdNodes, connections, nodeByLabel } = graph;
  if (createdNodes.length !== 9 || connections.length !== 11) return false;
  const expectedNodes = new Map([
    ["report intake", "input"],
    ["triage report", "action"],
    ["reproducible?", "condition"],
    ["investigate bug", "action"],
    ["fix bug", "action"],
    ["verification passed?", "condition"],
    ["release fix", "end"],
    ["request more details", "action"],
    ["close incomplete", "end"],
  ]);
  if ([...expectedNodes].some(([label, type]) => nodeByLabel.get(label)?.type !== type)) return false;
  const nodeLabelById = new Map([...nodeByLabel].map(([label, node]) => [node.id, label]));
  const actualConnections = new Set(connections.map((command) => {
    const edge = command.edge;
    return [
      nodeLabelById.get(edge?.source),
      edge?.sourcePort,
      nodeLabelById.get(edge?.target),
      edge?.targetPort,
    ].join("|");
  }));
  const expectedConnections = [
    ["report intake", "data", "triage report", "input"],
    ["triage report", "success", "reproducible?", "input"],
    ["reproducible?", "yes", "investigate bug", "input"],
    ["reproducible?", "no", "request more details", "input"],
    ["investigate bug", "success", "fix bug", "input"],
    ["investigate bug", "failure", "close incomplete", "input"],
    ["fix bug", "success", "verification passed?", "input"],
    ["fix bug", "failure", "close incomplete", "input"],
    ["verification passed?", "yes", "release fix", "input"],
    ["verification passed?", "no", "fix bug", "input"],
    ["request more details", "success", "close incomplete", "input"],
  ].map((parts) => parts.join("|"));
  return actualConnections.size === expectedConnections.length
    && expectedConnections.every((connection) => actualConnections.has(connection));
}

function isConnectionReroute(commands) {
  if (!Array.isArray(commands) || commands.length !== 1) return false;
  const command = commands[0];
  const replacement = command?.replacement;
  if (command?.type !== "replaceConnection"
    || command.edgeId !== "edge-receive-archive"
    || !Array.isArray(replacement)
    || replacement.length !== 1) return false;
  const edge = replacement[0];
  return edge?.source === "receive-request"
    && edge.sourcePort === "success"
    && edge.target === "manual-review"
    && edge.targetPort === "input";
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
  const completedEdits = calls.filter(isCompletedEdit);
  if (completedEdits.length !== 1) return false;
  const editCall = completedEdits[0];
  const editIndex = calls.indexOf(editCall);
  const wasUndone = calls.some((call, index) => index > editIndex
    && call.functionName === "undo_workflow_edit"
    && inputFor(call).operationId === editCall.result?.operationId
    && call.result?.status === "completed");
  if (wasUndone) return false;
  if (!matchingReceiptWasShown(calls, editCall)) return false;
  const commands = inputFor(editCall).commands;
  const outcomeType = attempt.outcomeType || (attempt.taskType === "create"
    ? "approval-create"
    : "notification-edit");
  return isSupportedOutcomeType(outcomeType) && outcomeValidators[outcomeType](commands);
}
