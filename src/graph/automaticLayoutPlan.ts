import type { WorkflowCommand } from "./commands";
import type { WorkflowState } from "./model";

type AutomaticLayoutPlanInput = {
  after: WorkflowState;
  commands: readonly WorkflowCommand[];
  currentNodeIds: readonly string[];
  newNodeIds: readonly string[];
};

export type AutomaticLayoutPlan = {
  ownedNodeIds: string[];
  movableNodeIds: string[];
};

/**
 * Tracks which node positions remain application-owned and scopes each layout
 * pass to components touched by new nodes or new connections.
 */
export function planAutomaticLayout({
  after,
  commands,
  currentNodeIds,
  newNodeIds,
}: AutomaticLayoutPlanInput): AutomaticLayoutPlan {
  const newlyAutomatic = new Set(newNodeIds);
  const owned = new Set([...currentNodeIds, ...newlyAutomatic]);

  for (const command of commands) {
    if (command.type === "updateNode" && command.patch.position !== undefined) {
      owned.delete(command.id);
    }
    if (command.type === "createNode" && !newlyAutomatic.has(command.node.id)) {
      owned.delete(command.node.id);
    }
  }

  const nodesById = new Set(after.nodes.map((node) => node.id));
  for (const id of owned) {
    if (!nodesById.has(id)) owned.delete(id);
  }

  const affectedSeeds = new Set(newlyAutomatic);
  for (const command of commands) {
    if (command.type !== "connect") continue;
    affectedSeeds.add(command.edge.source);
    affectedSeeds.add(command.edge.target);
  }
  if (affectedSeeds.size === 0) {
    return { ownedNodeIds: [...owned], movableNodeIds: [] };
  }

  const neighbors = new Map(after.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of after.edges) {
    if (!neighbors.has(edge.source) || !neighbors.has(edge.target)) continue;
    neighbors.get(edge.source)!.push(edge.target);
    neighbors.get(edge.target)!.push(edge.source);
  }

  const affected = new Set<string>();
  const visited = new Set<string>();
  const pending = [...affectedSeeds].filter((id) => nodesById.has(id));
  while (pending.length > 0) {
    const id = pending.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (owned.has(id)) affected.add(id);
    for (const neighborId of neighbors.get(id) ?? []) {
      if (!visited.has(neighborId)) pending.push(neighborId);
    }
  }

  const inWorkflowOrder = (ids: Set<string>) => after.nodes
    .filter((node) => ids.has(node.id))
    .map((node) => node.id);
  return {
    ownedNodeIds: inWorkflowOrder(owned),
    movableNodeIds: inWorkflowOrder(affected),
  };
}
