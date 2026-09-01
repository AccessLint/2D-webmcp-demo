type NodeDefinition = {
  title: string;
  inputs: readonly string[];
  outputs: readonly string[];
  requiredInputs: readonly string[];
  requiredOutputs: readonly string[];
  defaultProperties: Record<string, string | number | boolean>;
};

function defineNodeTypes<K extends string>(
  definitions: Record<K, NodeDefinition>,
): Record<K, NodeDefinition> {
  return definitions;
}

export const nodeDefinitions = defineNodeTypes({
  node: { title: "Node", inputs: ["input"], outputs: ["next"], requiredInputs: [], requiredOutputs: [], defaultProperties: {} },
  action: { title: "Action", inputs: ["input"], outputs: ["success", "failure"], requiredInputs: ["input"], requiredOutputs: [], defaultProperties: {} },
  condition: { title: "Condition", inputs: ["input"], outputs: ["yes", "no"], requiredInputs: ["input"], requiredOutputs: ["yes", "no"], defaultProperties: {} },
  start: { title: "Start", inputs: [], outputs: ["next"], requiredInputs: [], requiredOutputs: ["next"], defaultProperties: {} },
  end: { title: "End", inputs: ["input"], outputs: [], requiredInputs: ["input"], requiredOutputs: [], defaultProperties: {} },
  input: { title: "Input", inputs: [], outputs: ["data"], requiredInputs: [], requiredOutputs: ["data"], defaultProperties: {} },
  output: { title: "Output", inputs: ["data"], outputs: [], requiredInputs: ["data"], requiredOutputs: [], defaultProperties: {} },
  subprocess: { title: "Subprocess", inputs: ["input"], outputs: ["next"], requiredInputs: ["input"], requiredOutputs: ["next"], defaultProperties: {} },
  "parallel-gateway": { title: "Parallel Gateway", inputs: ["input"], outputs: ["next"], requiredInputs: ["input"], requiredOutputs: ["next"], defaultProperties: {} },
  "data-store": { title: "Data Store", inputs: ["write"], outputs: ["read"], requiredInputs: [], requiredOutputs: [], defaultProperties: {} },
});

export type NodeKind = keyof typeof nodeDefinitions;

export const nodeKinds = Object.keys(nodeDefinitions) as [NodeKind, ...NodeKind[]];
