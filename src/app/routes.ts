export function parseWorkflowHash(hash: string) {
  const node = hash.match(/^#inspect-node-(.+)$/);
  if (node) return { kind: "node" as const, id: decodeURIComponent(node[1]) };
  const edge = hash.match(/^#inspect-edge-(.+)$/);
  if (edge) return { kind: "edge" as const, id: decodeURIComponent(edge[1]) };
  return null;
}
