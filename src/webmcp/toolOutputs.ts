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
  const nodeTypes = Array.isArray(authoring.nodeTypes)
    ? authoring.nodeTypes.filter(isRecord).map(({ type, inputs, outputs }) => ({ type, inputs, outputs }))
    : [];
  const uiTargets = Array.isArray(authoring.uiTargets)
    ? authoring.uiTargets.filter(isRecord).map(({ id, label }) => ({ id, label }))
    : [];
  const pageItems = allItems.slice(cursor, cursor + requestedLimit);
  const capabilities = cursor === 0 ? {
    nodeTypes,
    uiTargets,
    nextCalls: {
      inspect: "inspect_workflow_items: use itemPage IDs.",
      edit: `edit_workflow baseRevision ${String(result.revision)}. Reuse itemPage IDs; no duplicates. Node positions are optional. A successful edit reveals its receipt.`,
    },
  } : {};
  const createOutput = () => ({
    schemaVersion: result.schemaVersion,
    revision: result.revision,
    counts: { nodes: result.nodes, edges: result.edges },
    ...capabilities,
    itemPage: {
      cursor,
      nextCursor: cursor + pageItems.length < allItems.length ? cursor + pageItems.length : null,
      items: pageItems,
    },
  });

  let output = createOutput();
  while (JSON.stringify(output).length > TOOL_OUTPUT_CHARACTER_BUDGET && pageItems.length > 1) {
    pageItems.pop();
    output = createOutput();
  }
  return output;
}

function compactReceipt(result: UnknownRecord, input: unknown) {
  const parsedInput = isRecord(input) ? input : {};
  const changes = Array.isArray(result.changes) ? result.changes.filter(isRecord) : [];
  const changeCursor = typeof parsedInput.changeCursor === "number" ? parsedInput.changeCursor : 0;
  const changeLimit = typeof parsedInput.changeLimit === "number" ? parsedInput.changeLimit : 3;
  const compactChanges = changes.slice(changeCursor, changeCursor + changeLimit).map((change) => {
    const object = isRecord(change.object) ? change.object : {};
    return { action: change.action, kind: object.kind, id: object.id };
  });
  const createOutput = () => ({
    schemaVersion: result.schemaVersion,
    operationId: result.operationId,
    status: result.status,
    baseRevision: result.baseRevision,
    resultingRevision: result.resultingRevision,
    summary: result.summary,
    ...(typeof result.visible === "boolean" ? { visible: result.visible } : {}),
    changeCount: changes.length,
    changePage: {
      cursor: changeCursor,
      nextCursor: changeCursor + compactChanges.length < changes.length ? changeCursor + compactChanges.length : null,
      items: compactChanges,
    },
    undo: result.undo,
    ...(isRecord(result.nextCall) ? { nextCall: result.nextCall } : {}),
    ...(result.failure ? { failure: result.failure } : {}),
    ...(result.recovery ? { recovery: result.recovery } : {}),
  });
  let output = createOutput();
  while (JSON.stringify(output).length > TOOL_OUTPUT_CHARACTER_BUDGET && compactChanges.length > 1) {
    compactChanges.pop();
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
      return {
        kind: reference.kind,
        id: item.id,
        label: item.label,
        source: item.source,
        target: item.target,
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
  const createOutput = () => ({
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
  });
  let output = createOutput();
  while (JSON.stringify(output).length > TOOL_OUTPUT_CHARACTER_BUDGET && issues.length > 1) {
    issues.pop();
    output = createOutput();
  }
  return output;
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
