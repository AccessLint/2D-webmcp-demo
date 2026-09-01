import type { NodeKind } from "./nodeTypes";

export { nodeKinds } from "./nodeTypes";
export type { NodeKind } from "./nodeTypes";

export type WorkflowNode = {
  id: string;
  type: NodeKind;
  label: string;
  position: { x: number; y: number };
  properties: Record<string, string | number | boolean>;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  label?: string;
};

export type WorkflowState = {
  revision: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type ObjectKind = "workflow-node" | "workflow-edge" | "change-receipt";

export type ApplicationReference = {
  kind: ObjectKind;
  id: string;
  label: string;
  href: string;
};
