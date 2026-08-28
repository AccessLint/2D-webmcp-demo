import type { NodeKind } from "./model";

type NodeDefinition = {
  title: string;
  inputs: readonly string[];
  outputs: readonly string[];
  requiredInputs: readonly string[];
  requiredOutputs: readonly string[];
};

export const nodeDefinitions: Record<NodeKind, NodeDefinition> = {
  start: { title: "Start", inputs: [], outputs: ["next"], requiredInputs: [], requiredOutputs: ["next"] },
  action: { title: "Action", inputs: ["input"], outputs: ["success", "failure"], requiredInputs: ["input"], requiredOutputs: [] },
  condition: { title: "Condition", inputs: ["input"], outputs: ["yes", "no"], requiredInputs: ["input"], requiredOutputs: ["yes", "no"] },
  retry: { title: "Retry", inputs: ["input"], outputs: ["success", "failure"], requiredInputs: ["input"], requiredOutputs: ["success", "failure"] },
  end: { title: "End", inputs: ["input"], outputs: [], requiredInputs: ["input"], requiredOutputs: [] },
};
