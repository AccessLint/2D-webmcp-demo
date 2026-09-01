import { describe, expect, it } from "vitest";
import { executeBatch, type WorkflowCommand } from "../src/graph/commands";
import { nodeKinds, type WorkflowState } from "../src/graph/model";
import { nodeDefinitions } from "../src/graph/nodeTypes";
import { createWorkflowStore } from "../src/state/workflowStore";
import { createToolHandlers } from "../src/webmcp/toolHandlers";

const emptyWorkflow = (): WorkflowState => ({ revision: 0, nodes: [], edges: [] });

describe("priority workflow node types", () => {
  it("publishes the complete authoring catalog and port contract", () => {
    expect(nodeKinds).toEqual([
      "node",
      "action",
      "condition",
      "start",
      "end",
      "input",
      "output",
      "subprocess",
      "parallel-gateway",
      "data-store",
    ]);
    expect(nodeDefinitions).toMatchObject({
      start: { title: "Start", inputs: [], outputs: ["next"] },
      end: { title: "End", inputs: ["input"], outputs: [] },
      input: { title: "Input", inputs: [], outputs: ["data"] },
      output: { title: "Output", inputs: ["data"], outputs: [] },
      subprocess: { title: "Subprocess", inputs: ["input"], outputs: ["next"] },
      "parallel-gateway": {
        title: "Parallel Gateway",
        inputs: ["input"],
        outputs: ["next"],
      },
      "data-store": { title: "Data Store", inputs: ["write"], outputs: ["read"] },
    });
  });

  it("accepts a workflow using every priority type and rejects impossible boundary ports", () => {
    const commands: WorkflowCommand[] = [
      { type: "createNode", node: { id: "start", type: "start", label: "Start", position: { x: 0, y: 0 }, properties: {} } },
      { type: "createNode", node: { id: "input", type: "input", label: "Request", position: { x: 0, y: 120 }, properties: {} } },
      { type: "createNode", node: { id: "subprocess", type: "subprocess", label: "Fulfill", position: { x: 200, y: 0 }, properties: {} } },
      { type: "createNode", node: { id: "gateway", type: "parallel-gateway", label: "Run in parallel", position: { x: 400, y: 0 }, properties: {} } },
      { type: "createNode", node: { id: "store", type: "data-store", label: "Orders", position: { x: 200, y: 120 }, properties: {} } },
      { type: "createNode", node: { id: "output", type: "output", label: "Receipt", position: { x: 400, y: 120 }, properties: {} } },
      { type: "createNode", node: { id: "end", type: "end", label: "Done", position: { x: 600, y: 0 }, properties: {} } },
      { type: "connect", edge: { id: "start-process", source: "start", sourcePort: "next", target: "subprocess", targetPort: "input" } },
      { type: "connect", edge: { id: "process-gateway", source: "subprocess", sourcePort: "next", target: "gateway", targetPort: "input" } },
      { type: "connect", edge: { id: "gateway-end", source: "gateway", sourcePort: "next", target: "end", targetPort: "input" } },
      { type: "connect", edge: { id: "input-store", source: "input", sourcePort: "data", target: "store", targetPort: "write" } },
      { type: "connect", edge: { id: "store-output", source: "store", sourcePort: "read", target: "output", targetPort: "data" } },
    ];

    expect(executeBatch(emptyWorkflow(), { baseRevision: 0, commands })).toMatchObject({
      ok: true,
    });

    const invalid = executeBatch(emptyWorkflow(), {
      baseRevision: 0,
      commands: [
        commands[0],
        commands[6],
        { type: "connect", edge: { id: "backwards", source: "end", sourcePort: "next", target: "start", targetPort: "input" } },
      ],
    });
    expect(invalid).toMatchObject({
      ok: false,
      code: "INVALID_COMMAND",
      message: "Done has no next output.",
    });
  });

  it("exposes every priority type to WebMCP authors", () => {
    const discovery = createToolHandlers(createWorkflowStore()).discover_workflow({});
    expect(discovery.authoring.nodeTypes).toEqual(expect.arrayContaining([
      { type: "start", title: "Start", inputs: [], outputs: ["next"] },
      { type: "end", title: "End", inputs: ["input"], outputs: [] },
      { type: "input", title: "Input", inputs: [], outputs: ["data"] },
      { type: "output", title: "Output", inputs: ["data"], outputs: [] },
      { type: "subprocess", title: "Subprocess", inputs: ["input"], outputs: ["next"] },
      { type: "parallel-gateway", title: "Parallel Gateway", inputs: ["input"], outputs: ["next"] },
      { type: "data-store", title: "Data Store", inputs: ["write"], outputs: ["read"] },
    ]));
  });
});
