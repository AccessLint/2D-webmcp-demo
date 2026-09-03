import type { WorkflowState } from "./model";
import { nodeDefinitions } from "./nodeTypes";

const HORIZONTAL_GAP = 300;
const VERTICAL_GAP = 200;
const CANVAS_INSET = 100;

/**
 * Places the requested nodes from left to right using the workflow's connections.
 * Nodes outside movableNodeIds remain fixed and can be used as layout anchors.
 */
export function layoutWorkflow(
  state: WorkflowState,
  movableNodeIds: readonly string[],
): WorkflowState {
  const movable = new Set(movableNodeIds);
  if (movable.size === 0) return state;

  const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, typeof state.edges>();
  const incoming = new Map<string, typeof state.edges>();
  const neighbors = new Map(state.nodes.map((node) => [node.id, [] as string[]]));
  const incomingCount = new Map(state.nodes.map((node) => [node.id, 0]));

  for (const edge of state.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
    neighbors.get(edge.source)!.push(edge.target);
    neighbors.get(edge.target)!.push(edge.source);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  const edgeOrder = (left: (typeof state.edges)[number], right: (typeof state.edges)[number]) => {
    const source = nodesById.get(left.source)!;
    const ports = nodeDefinitions[source.type].outputs;
    return ports.indexOf(left.sourcePort) - ports.indexOf(right.sourcePort)
      || left.target.localeCompare(right.target)
      || left.id.localeCompare(right.id);
  };
  for (const edges of outgoing.values()) edges.sort(edgeOrder);

  // Treat edges that return to an active traversal ancestor as back edges. The
  // remaining graph describes the forward-reading path and can be ranked even
  // when the workflow intentionally contains retry loops.
  const backEdgeIds = new Set<string>();
  const traversed = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string) => {
    traversed.add(id);
    active.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (active.has(edge.target)) backEdgeIds.add(edge.id);
      else if (!traversed.has(edge.target)) visit(edge.target);
    }
    active.delete(id);
  };
  const traversalOrder = [
    ...state.nodes.filter((node) => incomingCount.get(node.id) === 0),
    ...state.nodes.filter((node) => incomingCount.get(node.id) !== 0),
  ].map((node) => node.id);
  for (const id of traversalOrder) {
    if (!traversed.has(id)) visit(id);
  }

  const forwardIncomingCount = new Map(state.nodes.map((node) => [node.id, 0]));
  for (const edges of outgoing.values()) {
    for (const edge of edges) {
      if (!backEdgeIds.has(edge.id)) {
        forwardIncomingCount.set(edge.target, (forwardIncomingCount.get(edge.target) ?? 0) + 1);
      }
    }
  }

  const ranks = new Map<string, number>();
  const queue = state.nodes
    .filter((node) => forwardIncomingCount.get(node.id) === 0)
    .map((node) => node.id)
    .sort();
  for (const id of queue) ranks.set(id, 0);

  while (queue.length > 0) {
    const sourceId = queue.shift()!;
    const nextRank = (ranks.get(sourceId) ?? 0) + 1;
    for (const edge of outgoing.get(sourceId) ?? []) {
      if (backEdgeIds.has(edge.id)) continue;
      ranks.set(edge.target, Math.max(ranks.get(edge.target) ?? 0, nextRank));
      const remaining = (forwardIncomingCount.get(edge.target) ?? 0) - 1;
      forwardIncomingCount.set(edge.target, remaining);
      if (remaining === 0) queue.push(edge.target);
    }
    queue.sort();
  }

  // Defensive fallback for malformed graphs that escaped validation.
  for (const node of state.nodes) {
    if (!ranks.has(node.id)) ranks.set(node.id, 0);
  }

  const isolatedNodes = state.nodes.filter((node) => neighbors.get(node.id)?.length === 0);
  if (isolatedNodes.length > 0) {
    const connectedRanks = state.nodes
      .filter((node) => (neighbors.get(node.id)?.length ?? 0) > 0)
      .map((node) => ranks.get(node.id) ?? 0);
    const firstIsolatedRank = connectedRanks.length > 0 ? Math.max(...connectedRanks) + 1 : 0;
    isolatedNodes.forEach((node, index) => ranks.set(node.id, firstIsolatedRank + index));
  }

  const layers = new Map<number, string[]>();
  for (const node of state.nodes) {
    const rank = ranks.get(node.id)!;
    layers.set(rank, [...(layers.get(rank) ?? []), node.id]);
  }
  const widestLayer = Math.max(...Array.from(layers.values(), (ids) => ids.length));
  const idealPositions = new Map<string, { x: number; y: number }>();
  const forwardIncoming = (id: string) => (
    (incoming.get(id) ?? []).filter((edge) => !backEdgeIds.has(edge.id))
  );
  const nearestAvailableY = (desiredY: number, occupied: number[]) => {
    for (let distance = 0; distance <= occupied.length + 1; distance += 1) {
      const candidates = distance === 0
        ? [desiredY]
        : [desiredY - distance * VERTICAL_GAP, desiredY + distance * VERTICAL_GAP];
      const available = candidates.find((candidate) => (
        candidate >= CANVAS_INSET
        && occupied.every((used) => Math.abs(used - candidate) >= VERTICAL_GAP)
      ));
      if (available !== undefined) return available;
    }
    return desiredY + (occupied.length + 1) * VERTICAL_GAP;
  };

  for (const rank of Array.from(layers.keys()).sort((left, right) => left - right)) {
    const ids = layers.get(rank)!;
    const defaultInset = ((widestLayer - ids.length) * VERTICAL_GAP) / 2;
    const placements = ids.map((id, index) => {
      const incomingEdges = forwardIncoming(id);
      let desiredY = CANVAS_INSET + defaultInset + index * VERTICAL_GAP;
      if (incomingEdges.length > 0) {
        desiredY = incomingEdges.reduce(
          (total, edge) => total + idealPositions.get(edge.source)!.y,
          0,
        ) / incomingEdges.length;
      }
      if (incomingEdges.length === 1) {
        const [incomingEdge] = incomingEdges;
        const siblingEdges = (outgoing.get(incomingEdge.source) ?? []).filter((edge) => (
          !backEdgeIds.has(edge.id) && ranks.get(edge.target) === rank
        ));
        if (siblingEdges.length > 1) {
          const siblingIndex = siblingEdges.findIndex((edge) => edge.id === incomingEdge.id);
          desiredY += (siblingIndex - (siblingEdges.length - 1) / 2) * VERTICAL_GAP;
        }
      }
      return { id, desiredY, incomingCount: incomingEdges.length };
    }).sort((left, right) => (
      right.incomingCount - left.incomingCount
      || left.desiredY - right.desiredY
      || left.id.localeCompare(right.id)
    ));

    const occupied: number[] = [];
    for (const placement of placements) {
      const y = nearestAvailableY(placement.desiredY, occupied);
      occupied.push(y);
      idealPositions.set(placement.id, {
        x: CANVAS_INSET + rank * HORIZONTAL_GAP,
        y,
      });
    }
  }

  const median = (values: number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  };
  const offsets = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  for (const node of [...state.nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (visited.has(node.id)) continue;
    const componentIds: string[] = [];
    const pending = [node.id];
    visited.add(node.id);
    while (pending.length > 0) {
      const id = pending.shift()!;
      componentIds.push(id);
      for (const neighborId of neighbors.get(id) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        pending.push(neighborId);
      }
    }

    const fixedIds = componentIds.filter((id) => !movable.has(id));
    const offset = fixedIds.length === 0
      ? { x: 0, y: 0 }
      : {
          x: median(fixedIds.map((id) => nodesById.get(id)!.position.x - idealPositions.get(id)!.x)),
          y: median(fixedIds.map((id) => nodesById.get(id)!.position.y - idealPositions.get(id)!.y)),
        };
    componentIds.forEach((id) => offsets.set(id, offset));
  }

  return {
    ...state,
    nodes: state.nodes.map((node) => {
      if (!movable.has(node.id)) return node;
      const ideal = idealPositions.get(node.id)!;
      const offset = offsets.get(node.id)!;
      return { ...node, position: { x: ideal.x + offset.x, y: ideal.y + offset.y } };
    }),
  };
}
