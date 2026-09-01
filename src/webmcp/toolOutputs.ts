import type { ToolName } from "./toolNames";

export const TOOL_OUTPUT_CHARACTER_BUDGET = 1_500;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function compactDiscovery(result: UnknownRecord, input: unknown) {
  const authoring = isRecord(result.authoring) ? result.authoring : {};
  const nodes = Array.isArray(authoring.nodes) ? authoring.nodes.filter(isRecord) : [];
  const edges = Array.isArray(authoring.edges) ? authoring.edges.filter(isRecord) : [];
  const allItems = [
    ...nodes.map((node) => ({ kind: "workflow-node", id: node.id, type: node.type, label: node.label })),
    ...edges.map((edge) => ({ kind: "workflow-edge", id: edge.id })),
  ];
  const parsedInput = isRecord(input) ? input : {};
  const cursor = typeof parsedInput.cursor === "number" ? parsedInput.cursor : 0;
  const requestedLimit = typeof parsedInput.limit === "number" ? parsedInput.limit : 8;
  const problemCursor = typeof parsedInput.problemCursor === "number" ? parsedInput.problemCursor : 0;
  const problemLimit = typeof parsedInput.problemLimit === "number" ? parsedInput.problemLimit : 2;
  const validation = isRecord(result.validation) ? result.validation : {};
  const problems = Array.isArray(validation.problems) ? validation.problems.filter(isRecord) : [];
  const nodeTypes = Array.isArray(authoring.nodeTypes)
    ? authoring.nodeTypes.filter(isRecord).map(({ type, inputs, outputs }) => ({ type, inputs, outputs }))
    : [];
  const uiTargets = Array.isArray(authoring.uiTargets)
    ? authoring.uiTargets.filter(isRecord).map(({ id, label }) => ({ id, label }))
    : [];
  const pageItems = allItems.slice(cursor, cursor + requestedLimit);
  const problemItems = problems.slice(problemCursor, problemCursor + problemLimit).map((problem) => {
    const target = isRecord(problem.target) ? problem.target : undefined;
    return {
      code: problem.code,
      severity: problem.severity,
      message: problem.message,
      ...(target ? { target: { kind: target.kind, id: target.id } } : {}),
    };
  });
  const createOutput = () => ({
    schemaVersion: result.schemaVersion,
    revision: result.revision,
    counts: { nodes: result.nodes, edges: result.edges },
    validation: {
      valid: validation.valid,
      problemCount: problems.length,
      problemPage: {
        cursor: problemCursor,
        nextCursor: problemCursor + problemItems.length < problems.length ? problemCursor + problemItems.length : null,
        items: problemItems,
      },
    },
    nodeTypes,
    uiTargets,
    itemPage: {
      cursor,
      nextCursor: cursor + pageItems.length < allItems.length ? cursor + pageItems.length : null,
      items: pageItems,
    },
    nextCalls: {
      inspect: "Use inspect_workflow_items with IDs from itemPage.",
      edit: `Use edit_workflow with baseRevision ${String(result.revision)}. Reuse listed node IDs; do not create duplicates. Every command uses type. Edge commands: connect {edge:{id,source,sourcePort,target,targetPort}}; disconnect {edgeId}; replaceConnection {edgeId,replacement:[edge]}.`,
    },
  });

  let output = createOutput();
  while (JSON.stringify(output).length > TOOL_OUTPUT_CHARACTER_BUDGET && (pageItems.length > 1 || problemItems.length > 1)) {
    if (problemItems.length > 0) problemItems.pop();
    else if (pageItems.length > 1) pageItems.pop();
    output = createOutput();
  }
  return output;
}

function compactReceipt(result: UnknownRecord, input: unknown) {
  const parsedInput = isRecord(input) ? input : {};
  const changes = Array.isArray(result.changes) ? result.changes.filter(isRecord) : [];
  const changeCursor = typeof parsedInput.changeCursor === "number" ? parsedInput.changeCursor : 0;
  const changeLimit = typeof parsedInput.changeLimit === "number" ? parsedInput.changeLimit : 3;
  const problemCursor = typeof parsedInput.problemCursor === "number" ? parsedInput.problemCursor : 0;
  const problemLimit = typeof parsedInput.problemLimit === "number" ? parsedInput.problemLimit : 2;
  const compactChanges = changes.slice(changeCursor, changeCursor + changeLimit).map((change) => {
    const object = isRecord(change.object) ? change.object : {};
    return { action: change.action, kind: object.kind, id: object.id };
  });
  const validation = isRecord(result.validation) ? result.validation : {};
  const problems = Array.isArray(validation.problems) ? validation.problems.filter(isRecord) : [];
  const compactProblems = problems.slice(problemCursor, problemCursor + problemLimit).map((problem) => {
    const target = isRecord(problem.target) ? problem.target : undefined;
    return {
      code: problem.code,
      severity: problem.severity,
      message: problem.message,
      ...(target ? { target: { kind: target.kind, id: target.id } } : {}),
    };
  });
  const createOutput = () => ({
    schemaVersion: result.schemaVersion,
    operationId: result.operationId,
    status: result.status,
    baseRevision: result.baseRevision,
    resultingRevision: result.resultingRevision,
    summary: result.summary,
    changeCount: changes.length,
    changePage: {
      cursor: changeCursor,
      nextCursor: changeCursor + compactChanges.length < changes.length ? changeCursor + compactChanges.length : null,
      items: compactChanges,
    },
    validation: {
      valid: validation.valid,
      problemCount: problems.length,
      problemPage: {
        cursor: problemCursor,
        nextCursor: problemCursor + compactProblems.length < problems.length ? problemCursor + compactProblems.length : null,
        items: compactProblems,
      },
    },
    undo: result.undo,
    ...(result.status === "completed" && typeof result.operationId === "string" ? {
      nextCall: {
        tool: "show_edit_result",
        input: { operationId: result.operationId },
        purpose: "Show visible evidence, then briefly state the operation's outcome or implication.",
      },
    } : {}),
    ...(result.failure ? { failure: result.failure } : {}),
    ...(result.recovery ? { recovery: result.recovery } : {}),
  });
  let output = createOutput();
  while (JSON.stringify(output).length > TOOL_OUTPUT_CHARACTER_BUDGET && (compactChanges.length > 1 || compactProblems.length > 1)) {
    if (compactProblems.length > 1) compactProblems.pop();
    else compactChanges.pop();
    output = createOutput();
  }
  return output;
}

function compactInspection(result: unknown[], input: unknown) {
  const parsedInput = isRecord(input) ? input : {};
  const detail = parsedInput.detail === "properties" || parsedInput.detail === "relationships" ? parsedInput.detail : "summary";
  const cursor = typeof parsedInput.cursor === "number" ? parsedInput.cursor : 0;
  const limit = typeof parsedInput.limit === "number" ? parsedInput.limit : 3;
  const compactItems = result.filter(isRecord).map((item): UnknownRecord => {
    const reference = isRecord(item.reference) ? item.reference : {};
    const relationships = Array.isArray(item.relationships) ? item.relationships.filter(isRecord) : [];
    if (reference.kind === "workflow-edge") {
      const sourceNode = isRecord(item.sourceNode) ? item.sourceNode : {};
      const targetNode = isRecord(item.targetNode) ? item.targetNode : {};
      return {
        kind: reference.kind,
        id: item.id,
        label: item.label,
        sourceId: sourceNode.id,
        sourcePort: item.sourcePort,
        targetId: targetNode.id,
        targetPort: item.targetPort,
      };
    }
    const properties = isRecord(item.properties) ? item.properties : {};
    const compactRelationships = relationships.slice(cursor, cursor + limit).map((relationship) => {
      const other = isRecord(relationship.other) ? relationship.other : {};
      const edge = isRecord(relationship.edge) ? relationship.edge : {};
      return {
        direction: relationship.direction,
        port: relationship.port,
        otherId: other.id,
        edgeId: edge.id,
      };
    });
    return {
      kind: reference.kind,
      id: item.id,
      type: item.type,
      label: item.label,
      position: item.position,
      propertyNames: Object.keys(properties),
      ...(detail === "properties" ? { properties } : {}),
      relationshipCount: relationships.length,
      ...(detail === "relationships" ? {
        relationshipPage: {
          cursor,
          nextCursor: cursor + compactRelationships.length < relationships.length ? cursor + compactRelationships.length : null,
          items: compactRelationships,
        },
      } : {}),
    };
  });
  const pageItems: UnknownRecord[] = [];
  for (const originalItem of compactItems) {
    let item = originalItem;
    let candidate = {
      requestedCount: compactItems.length,
      returnedCount: pageItems.length + 1,
      hasMore: pageItems.length + 1 < compactItems.length,
      items: [...pageItems, item],
    };
    if (pageItems.length === 0 && JSON.stringify(candidate).length > TOOL_OUTPUT_CHARACTER_BUDGET) {
      const relationshipPage = isRecord(item.relationshipPage) ? item.relationshipPage : undefined;
      const relationshipItems = relationshipPage && Array.isArray(relationshipPage.items) ? [...relationshipPage.items] : [];
      while (JSON.stringify(candidate).length > TOOL_OUTPUT_CHARACTER_BUDGET && relationshipItems.length > 0) {
        relationshipItems.pop();
        item = {
          ...item,
          relationshipPage: {
            ...relationshipPage,
            nextCursor: cursor + relationshipItems.length,
            items: relationshipItems,
          },
        };
        candidate = { ...candidate, items: [item] };
      }
      if (JSON.stringify(candidate).length > TOOL_OUTPUT_CHARACTER_BUDGET && "properties" in item) {
        const summaryItem = { ...item };
        Reflect.deleteProperty(summaryItem, "properties");
        item = { ...summaryItem, detailsTruncated: true };
        candidate = { ...candidate, items: [item] };
      }
      if (JSON.stringify(candidate).length > TOOL_OUTPUT_CHARACTER_BUDGET && Array.isArray(item.propertyNames)) {
        const propertyNames = item.propertyNames;
        const summaryItem = { ...item, propertyCount: propertyNames.length, detailsTruncated: true };
        Reflect.deleteProperty(summaryItem, "propertyNames");
        item = summaryItem;
        candidate = { ...candidate, items: [item] };
      }
      if (JSON.stringify(candidate).length > TOOL_OUTPUT_CHARACTER_BUDGET && "label" in item) {
        const summaryItem = { ...item, labelOmitted: true, detailsTruncated: true };
        Reflect.deleteProperty(summaryItem, "label");
        item = summaryItem;
        candidate = { ...candidate, items: [item] };
      }
    }
    if (JSON.stringify(candidate).length > TOOL_OUTPUT_CHARACTER_BUDGET) break;
    pageItems.push(item);
  }
  return {
    requestedCount: compactItems.length,
    returnedCount: pageItems.length,
    hasMore: pageItems.length < compactItems.length,
    items: pageItems,
  };
}

function compactError(result: UnknownRecord) {
  const error = isRecord(result.error) ? result.error : {};
  const allIssues = Array.isArray(error.issues) ? error.issues : [];
  const issues = allIssues.slice(0, 5);
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(allIssues.length > 0 ? {
        issueCount: allIssues.length,
        issues,
        issuesTruncated: allIssues.length > issues.length,
      } : {}),
      recovery: error.recovery,
    },
  };
}

const receiptTools = new Set<ToolName>(["edit_workflow", "get_edit_result", "undo_workflow_edit"]);

const outputTooLarge = (name: ToolName) => ({
  ok: false,
  error: {
    code: "OUTPUT_TOO_LARGE",
    message: "The tool result exceeded the safe output budget.",
    recovery: {
      tool: name,
      reason: name === "inspect_workflow_items"
        ? "Request fewer objects and retry."
        : "Narrow the request and retry.",
    },
  },
});

export function fitToolOutput(name: ToolName, input: unknown, result: unknown): unknown {
  const serializedLength = (JSON.stringify(result) ?? "").length;
  if (isRecord(result) && isRecord(result.error)) {
    if (serializedLength <= TOOL_OUTPUT_CHARACTER_BUDGET) return result;
    const compact = compactError(result);
    if (JSON.stringify(compact).length <= TOOL_OUTPUT_CHARACTER_BUDGET) return compact;
    return outputTooLarge(name);
  }
  const compact = name === "discover_workflow" && isRecord(result)
    ? compactDiscovery(result, input)
    : name === "inspect_workflow_items" && Array.isArray(result)
      ? compactInspection(result, input)
      : receiptTools.has(name) && isRecord(result)
        ? compactReceipt(result, input)
        : undefined;
  if (compact && JSON.stringify(compact).length <= TOOL_OUTPUT_CHARACTER_BUDGET) return compact;
  if (serializedLength <= TOOL_OUTPUT_CHARACTER_BUDGET) return result;
  return outputTooLarge(name);
}
