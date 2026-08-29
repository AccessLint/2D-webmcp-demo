import type { WorkflowState } from "../graph/model";
import { nodeDefinitions } from "../graph/nodeTypes";
import { nodeReference } from "../graph/references";
import { validateWorkflow } from "../graph/validation";
import { uiTargetList } from "./uiTargets";
import { toolNames } from "./toolNames";
import { surfaceSchemaDescriptor, workflowSurfaceSnapshot } from "./surfaceSnapshot";

export function workflowSummary(state: WorkflowState) {
  const validation = validateWorkflow(state);
  const exampleNode = state.nodes.find((node) => node.type !== "start") ?? state.nodes[0];
  const surfaceSnapshot = workflowSurfaceSnapshot(state);
  return {
    schemaVersion: "1" as const,
    revision: state.revision,
    nodes: state.nodes.length,
    edges: state.edges.length,
    entryPoints: state.nodes.filter((node) => node.type === "start").map(nodeReference),
    terminalNodes: state.nodes.filter((node) => node.type === "end").map(nodeReference),
    validation,
    surfaceSchema: surfaceSchemaDescriptor,
    surfaceSnapshot,
    authoring: {
      nodeTypes: Object.entries(nodeDefinitions).map(([type, definition]) => ({ type, title: definition.title, inputs: [...definition.inputs], outputs: [...definition.outputs] })),
      nodes: state.nodes.map((node) => ({ id: node.id, type: node.type, label: node.label, inputs: [...nodeDefinitions[node.type].inputs], outputs: [...nodeDefinitions[node.type].outputs] })),
      edges: state.edges.map(({ id, source, sourcePort, target, targetPort, label }) => ({ id, source, sourcePort, target, targetPort, ...(label ? { label } : {}) })),
      uiTargets: uiTargetList,
    },
    recommendedNextCalls: [
      { tool: toolNames.inspectWorkflowItems, input: { objects: exampleNode ? [{ kind: "workflow-node" as const, id: exampleNode.id }] : [] } },
      ...(exampleNode ? [{
        tool: toolNames.editWorkflow,
        purpose: "Copy this valid call shape and replace the example command with the intended edit.",
        input: {
          baseRevision: state.revision,
          commands: [{ type: "updateNode" as const, id: exampleNode.id, patch: { label: exampleNode.label } }],
        },
      }] : []),
    ],
  };
}
