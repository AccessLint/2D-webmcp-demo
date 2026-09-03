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

function matchingReceiptWasShown(calls, editCall) {
  return calls.some((call) => call.functionName === "show_edit_result"
    && inputFor(call).operationId === editCall.result?.operationId
    && call.result?.visible === true
    && call.result?.status === "completed");
}

function isNotificationEdit(commands) {
  if (!Array.isArray(commands) || commands.some((command) =>
    command?.type !== "createNode" && command?.type !== "connect")) return false;
  const createdNodes = commands.filter((command) => command.type === "createNode");
  const connections = commands.filter((command) => command.type === "connect");
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
  if (!Array.isArray(commands) || commands.some((command) =>
    !["createNode", "connect"].includes(command?.type))) return false;
  const createdNodes = commands.filter((command) => command.type === "createNode");
  const connections = commands.filter((command) => command.type === "connect");
  if (createdNodes.length !== 2 || connections.length !== 1) return false;
  const nodeByLabel = new Map(createdNodes.map((command) => [
    String(labelValue(command.node?.label) || "").toLowerCase(),
    command.node,
  ]));
  const draft = nodeByLabel.get("draft request");
  const approve = nodeByLabel.get("approve request");
  const edge = connections[0].edge;
  return Boolean(draft && approve
    && edge?.source === draft.id
    && edge.sourcePort === "success"
    && edge.target === approve.id
    && edge.targetPort === "input");
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
  return attempt.taskType === "create"
    ? isCreateApprovalEdit(commands)
    : isNotificationEdit(commands);
}
