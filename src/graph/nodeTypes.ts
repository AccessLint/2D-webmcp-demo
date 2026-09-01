import type { NodeKind } from "./model";

type NodeDefinition = {
  title: string;
  inputs: readonly string[];
  outputs: readonly string[];
  requiredInputs: readonly string[];
  requiredOutputs: readonly string[];
  defaultProperties: Record<string, string | number | boolean>;
};

export const nodeDefinitions: Record<NodeKind, NodeDefinition> = {
  node: { title: "Node", inputs: ["input"], outputs: ["next"], requiredInputs: [], requiredOutputs: [], defaultProperties: {} },
  action: { title: "Action", inputs: ["input"], outputs: ["success", "failure"], requiredInputs: ["input"], requiredOutputs: [], defaultProperties: {} },
  condition: { title: "Condition", inputs: ["input"], outputs: ["yes", "no"], requiredInputs: ["input"], requiredOutputs: ["yes", "no"], defaultProperties: {} },
};
