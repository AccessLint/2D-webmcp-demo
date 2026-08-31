import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type AriaLabelConfig,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowCommand } from "../graph/commands";
import type { WorkflowEdge, WorkflowNode } from "../graph/model";
import { nodeDefinitions } from "../graph/nodeTypes";
import { useWorkflowStore, type WorkflowSelection } from "../state/workflowStore";

type CardData = {
  label: string;
  kind: keyof typeof nodeDefinitions;
  properties: Record<string, string | number | boolean>;
};

type WorkflowFlowNode = Node<CardData>;

function WorkflowCard({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const definition = nodeDefinitions[data.kind];
  return (
    <div className={`flow-node flow-node--${data.kind}${selected ? " is-selected" : ""}`}>
      {definition.inputs.map((port, index) => (
        <Handle
          key={port}
          id={port}
          type="target"
          position={Position.Left}
          style={{ top: `${((index + 1) / (definition.inputs.length + 1)) * 100}%` }}
          aria-label={`${port} input`}
        />
      ))}
      <span className="flow-node__type">{definition.title}</span>
      <strong>{data.label}</strong>
      {data.properties.attempts ? (
        <span className="flow-node__meta">{String(data.properties.attempts)} attempts</span>
      ) : null}
      {definition.outputs.map((port, index) => (
        <Handle
          key={port}
          id={port}
          type="source"
          position={Position.Right}
          style={{ top: `${((index + 1) / (definition.outputs.length + 1)) * 100}%` }}
          aria-label={`${port} output`}
        />
      ))}
    </div>
  );
}

const nodeTypes = { workflow: WorkflowCard };
const ariaLabelConfig = {
  "node.a11yDescription.ariaLiveMessage": ({ direction }: { direction: string }) =>
    `Moved selected node ${direction}.`,
} satisfies Partial<AriaLabelConfig>;

function toFlowNode(node: WorkflowNode, selected: WorkflowSelection | null): WorkflowFlowNode {
  const isSelected = selected?.kind === "node" && selected.id === node.id;
  return {
    id: node.id,
    type: "workflow",
    position: node.position,
    data: { label: node.label, kind: node.type, properties: node.properties },
    selected: isSelected,
    focusable: true,
    ariaLabel: `${nodeDefinitions[node.type].title} node: ${node.label}`,
    domAttributes: { "aria-current": isSelected ? "true" : undefined },
  };
}

function toFlowEdge(edge: WorkflowEdge, selected: WorkflowSelection | null): Edge {
  return {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourcePort,
    target: edge.target,
    targetHandle: edge.targetPort,
    label: edge.label ?? edge.sourcePort,
    selected: selected?.kind === "edge" && selected.id === edge.id,
  };
}

export function WorkflowCanvas() {
  const workflow = useWorkflowStore((state) => state.workflow);
  const selected = useWorkflowStore((state) => state.selected);
  const focusRequest = useWorkflowStore((state) => state.focusRequest);
  const apply = useWorkflowStore((state) => state.apply);
  const select = useWorkflowStore((state) => state.select);
  const reportError = useWorkflowStore((state) => state.reportError);
  const flow = useRef<ReactFlowInstance<WorkflowFlowNode, Edge> | null>(null);
  const shell = useRef<HTMLDivElement | null>(null);
  const fitFrame = useRef<number | null>(null);
  const nodes = useMemo(
    () => workflow.nodes.map((node) => toFlowNode(node, selected)),
    [workflow.nodes, selected],
  );
  const edges = useMemo(
    () => workflow.edges.map((edge) => toFlowEdge(edge, selected)),
    [workflow.edges, selected],
  );

  const fitCanvas = useCallback(() => {
    if (fitFrame.current !== null) cancelAnimationFrame(fitFrame.current);
    fitFrame.current = requestAnimationFrame(() => {
      fitFrame.current = requestAnimationFrame(() => {
        fitFrame.current = null;
        if (!flow.current || !shell.current?.clientWidth || !shell.current.clientHeight) return;
        void flow.current.fitView({ padding: .2, duration: 0 });
      });
    });
  }, []);

  useEffect(() => {
    const element = shell.current;
    if (!element) return;
    let wasMeasurable = false;
    const observer = new ResizeObserver(([entry]) => {
      const isMeasurable = entry.contentRect.width > 0 && entry.contentRect.height > 0;
      if (isMeasurable && !wasMeasurable) fitCanvas();
      wasMeasurable = isMeasurable;
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (fitFrame.current !== null) cancelAnimationFrame(fitFrame.current);
    };
  }, [fitCanvas]);

  useEffect(() => {
    if (!focusRequest || !selected || !flow.current) return;
    const nodeIds = selected.kind === "node"
      ? [selected.id]
      : workflow.edges
        .filter((edge) => edge.id === selected.id)
        .flatMap((edge) => [edge.source, edge.target]);
    if (nodeIds.length > 0) {
      void flow.current.fitView({
        nodes: nodeIds.map((id) => ({ id })),
        padding: .8,
        duration: 300,
        maxZoom: 1.1,
      });
    }
  }, [focusRequest, selected, workflow.edges]);

  const runCanvasChange = useCallback((change: () => void) => {
    try {
      change();
    } catch (error) {
      reportError(error instanceof Error ? error.message : "The canvas change failed.");
    }
  }, [reportError]);

  const onNodesChange = useCallback((changes: NodeChange<WorkflowFlowNode>[]) => {
    const selectedNode = changes.find(
      (change) => change.type === "select" && change.selected,
    );
    if (selectedNode?.type === "select") {
      select({ kind: "node", id: selectedNode.id });
    } else if (
      selected?.kind === "node"
      && changes.some(
        (change) => change.type === "select" && !change.selected && change.id === selected.id,
      )
    ) {
      select(null);
    }

    const positionCommands = changes.flatMap((change): WorkflowCommand[] => (
      change.type === "position" && change.dragging === false && change.position
        ? [{ type: "updateNode", id: change.id, patch: { position: change.position } }]
        : []
    ));
    if (positionCommands.length > 0) {
      runCanvasChange(() => apply(workflow.revision, positionCommands, "Move node"));
    }
  }, [apply, runCanvasChange, select, selected, workflow.revision]);

  const onConnect = (connection: Connection) => runCanvasChange(() => {
    apply(workflow.revision, [{
      type: "connect",
      edge: {
        id: `edge-${crypto.randomUUID()}`,
        source: connection.source,
        sourcePort: connection.sourceHandle ?? "success",
        target: connection.target,
        targetPort: connection.targetHandle ?? "input",
      },
    }], "Canvas connection");
  });

  const nodeLabels = new Map(workflow.nodes.map((node) => [node.id, node.label]));

  return (
    <>
      <div ref={shell} className="canvas-shell" aria-label="Visual workflow canvas">
        <p id="workflow-canvas-instructions" className="sr-only">
          Tab to a node. Press Enter or Space to select it. Use the Arrow keys to move it.
          Hold Shift with an Arrow key to move farther. Press Backspace to delete it.
          Press Escape to clear selection. Use the Workflow connections region to review and
          select connections.
        </p>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesFocusable
          edgesFocusable={false}
          fitView
          minZoom={0.25}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => select({ kind: "node", id: node.id })}
          onEdgeClick={(_, edge) => select({ kind: "edge", id: edge.id })}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onInit={(instance) => {
            flow.current = instance;
            fitCanvas();
          }}
          onNodesDelete={(items) => runCanvasChange(() => apply(
            workflow.revision,
            items.map((node) => ({ type: "deleteNode" as const, id: node.id })),
            "Delete nodes",
          ))}
          onEdgesDelete={(items) => runCanvasChange(() => apply(
            workflow.revision,
            items.map((edge) => ({ type: "disconnect" as const, edgeId: edge.id })),
            "Disconnect edges",
          ))}
          ariaLabelConfig={ariaLabelConfig}
          aria-label="Workflow canvas"
          aria-describedby="workflow-canvas-instructions"
        >
          <Background color="#2d4254" gap={24} size={1} />
          <MiniMap
            pannable
            zoomable
            nodeColor="#c8ff80"
            bgColor="#0b151d"
            maskColor="rgba(6, 13, 20, .72)"
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <section className="connection-panel" aria-labelledby="workflow-connections-heading">
        <div className="connection-panel__heading">
          <h2 id="workflow-connections-heading" tabIndex={-1}>Workflow connections</h2>
          <span>{workflow.edges.length}</span>
        </div>
        <p id="workflow-connections-instructions" className="sr-only">
          Press Enter or Space to select a connection. Press Delete or Backspace to disconnect it.
          Press Escape to clear selection.
        </p>
        <ul>
          {workflow.edges.map((edge) => {
            const sourceLabel = nodeLabels.get(edge.source) ?? edge.source;
            const targetLabel = nodeLabels.get(edge.target) ?? edge.target;
            const connectionLabel = edge.label ?? edge.sourcePort;
            const isSelected = selected?.kind === "edge" && selected.id === edge.id;
            return (
              <li key={edge.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-describedby="workflow-connections-instructions"
                  onClick={() => select({ kind: "edge", id: edge.id })}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      select(null);
                    } else if (event.key === "Delete" || event.key === "Backspace") {
                      event.preventDefault();
                      runCanvasChange(() => apply(
                        workflow.revision,
                        [{ type: "disconnect", edgeId: edge.id }],
                        "Disconnect edge",
                      ));
                      select(null);
                      queueMicrotask(() => {
                        document.getElementById("workflow-connections-heading")?.focus();
                      });
                    }
                  }}
                >
                  <span>{sourceLabel}</span>
                  <span className="sr-only">to</span>
                  <span aria-hidden="true">→</span>
                  <span>{targetLabel}</span>
                  <span className="connection-panel__port">{connectionLabel} connection</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
