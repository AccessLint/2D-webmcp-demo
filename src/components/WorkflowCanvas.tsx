import { useCallback, useEffect, useMemo, useRef, type FormEvent } from "react";
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
import type { NodeKind, WorkflowEdge, WorkflowNode } from "../graph/model";
import { nodeDefinitions } from "../graph/nodeTypes";
import {
  useWorkflowStore,
  type WorkflowConnectionSource,
  type WorkflowSelection,
} from "../state/workflowStore";

type CardData = {
  label: string;
  kind: keyof typeof nodeDefinitions;
  properties: Record<string, string | number | boolean>;
  connectingPort: string | null;
};

type WorkflowFlowNode = Node<CardData>;

function WorkflowCard({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const definition = nodeDefinitions[data.kind];
  return (
    <div
      className={`flow-node flow-node--${data.kind}${selected ? " is-selected" : ""}${data.connectingPort ? " is-connecting" : ""}`}
      role="gridcell"
    >
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
      {definition.outputs.map((port, index) => (
        <Handle
          key={port}
          id={port}
          type="source"
          position={Position.Right}
          className={data.connectingPort === port ? "is-connecting" : undefined}
          style={{ top: `${((index + 1) / (definition.outputs.length + 1)) * 100}%` }}
          aria-label={`${port} output`}
        />
      ))}
    </div>
  );
}

const nodeTypes = { workflow: WorkflowCard };
const connectionKeyboardShortcut = "Control+C or Command+C";
const nodeKeyboardDescription =
  `Use the Arrow keys to navigate between nodes. Press Enter or Space to toggle selection. Press ${connectionKeyboardShortcut} to start a connection, press it again on the source to choose another output, or move to another node and press it to connect. Hold Alt with an Arrow key to move a selected node, or add Shift to move it farther. Press Delete or Backspace to remove it and Escape to cancel a connection or clear selection.`;
const ariaLabelConfig = {
  "node.a11yDescription.default": nodeKeyboardDescription,
  "node.a11yDescription.keyboardDisabled": nodeKeyboardDescription,
  "node.a11yDescription.ariaLiveMessage": ({ direction }: { direction: string }) =>
    `Moved selected node ${direction}.`,
} satisfies Partial<AriaLabelConfig>;

function createNodeId(label: string, nodes: WorkflowNode[]) {
  const base = label
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "node";
  const ids = new Set(nodes.map((node) => node.id));
  let id = base;
  let suffix = 2;
  while (ids.has(id)) id = `${base}-${suffix++}`;
  return id;
}

function isNodeKind(value: string): value is NodeKind {
  return Object.prototype.hasOwnProperty.call(nodeDefinitions, value);
}

type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

const arrowKeys = new Set<ArrowKey>(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function isArrowKey(key: string): key is ArrowKey {
  return arrowKeys.has(key as ArrowKey);
}

type TreeGridRow = { node: WorkflowNode; level: number; parentId: string | null };

function treeGridRows(nodes: WorkflowNode[], edges: WorkflowEdge[]): TreeGridRow[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Set<string>();
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue;
    incoming.add(edge.target);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const rows: TreeGridRow[] = [];
  const visited = new Set<string>();
  const visit = (node: WorkflowNode, level: number, parentId: string | null) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    rows.push({ node, level, parentId });
    for (const childId of outgoing.get(node.id) ?? []) {
      const child = nodesById.get(childId);
      if (child) visit(child, level + 1, node.id);
    }
  };

  for (const root of nodes.filter((node) => !incoming.has(node.id))) visit(root, 1, null);
  for (const node of nodes) {
    visit(node, 1, null);
  }
  return rows;
}

function treeGridDestination(
  currentId: string,
  rows: TreeGridRow[],
  key: ArrowKey,
): WorkflowNode | null {
  const index = rows.findIndex(({ node }) => node.id === currentId);
  if (index < 0) return null;
  const current = rows[index];
  if (key === "ArrowUp") return rows[index - 1]?.node ?? null;
  if (key === "ArrowDown") return rows[index + 1]?.node ?? null;
  if (key === "ArrowLeft") {
    return current.parentId
      ? rows.find(({ node }) => node.id === current.parentId)?.node ?? null
      : null;
  }
  const firstChild = rows[index + 1];
  return firstChild?.parentId === current.node.id ? firstChild.node : null;
}

function toFlowNode(
  node: WorkflowNode,
  selected: WorkflowSelection | null,
  rovingNodeId: string | null,
  connectionSource: WorkflowConnectionSource | null,
  level: number,
  rowIndex: number,
): WorkflowFlowNode {
  const isSelected = selected?.kind === "node" && selected.id === node.id;
  const isConnectionSource = connectionSource?.nodeId === node.id;
  const nodeLabel = node.type === "node"
    ? `Node: ${node.label}`
    : `${nodeDefinitions[node.type].title} node: ${node.label}`;
  return {
    id: node.id,
    type: "workflow",
    position: node.position,
    data: {
      label: node.label,
      kind: node.type,
      properties: node.properties,
      connectingPort: isConnectionSource ? connectionSource.port : null,
    },
    selected: isSelected,
    focusable: true,
    ariaLabel: `${nodeLabel}${isConnectionSource ? `, connection source using ${connectionSource.port} output` : ""}`,
    ariaRole: "row",
    domAttributes: {
      "aria-level": level,
      "aria-rowindex": rowIndex,
      "aria-selected": isSelected,
      "aria-keyshortcuts": "Control+C Meta+C",
      "aria-roledescription": undefined,
      tabIndex: node.id === rovingNodeId ? 0 : -1,
    },
  };
}

function toFlowEdge(
  edge: WorkflowEdge,
  selected: WorkflowSelection | null,
  nodeLabels: Map<string, string>,
): Edge {
  const sourceLabel = nodeLabels.get(edge.source) ?? edge.source;
  const targetLabel = nodeLabels.get(edge.target) ?? edge.target;
  const connectionLabel = edge.label ?? edge.sourcePort;
  return {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourcePort,
    target: edge.target,
    targetHandle: edge.targetPort,
    label: connectionLabel,
    ariaLabel: `Connection from ${sourceLabel} to ${targetLabel}: ${connectionLabel}`,
    selected: selected?.kind === "edge" && selected.id === edge.id,
  };
}

export function WorkflowCanvas() {
  const workflow = useWorkflowStore((state) => state.workflow);
  const nodeReveal = useWorkflowStore((state) => state.nodeReveal);
  const selected = useWorkflowStore((state) => state.selected);
  const focusRequest = useWorkflowStore((state) => state.focusRequest);
  const apply = useWorkflowStore((state) => state.apply);
  const clear = useWorkflowStore((state) => state.clear);
  const select = useWorkflowStore((state) => state.select);
  const connectionSource = useWorkflowStore((state) => state.connectionSource);
  const setConnectionSource = useWorkflowStore((state) => state.setConnectionSource);
  const reportStatus = useWorkflowStore((state) => state.reportStatus);
  const reportError = useWorkflowStore((state) => state.reportError);
  const flow = useRef<ReactFlowInstance<WorkflowFlowNode, Edge> | null>(null);
  const shell = useRef<HTMLDivElement | null>(null);
  const fitFrame = useRef<number | null>(null);
  const activeNodeId = useRef<string | null>(null);
  const hiddenNodeIds = useMemo(
    () => new Set(nodeReveal?.pendingNodeIds ?? []),
    [nodeReveal?.pendingNodeIds],
  );
  const visibleNodes = useMemo(
    () => workflow.nodes.filter((node) => !hiddenNodeIds.has(node.id)),
    [hiddenNodeIds, workflow.nodes],
  );
  const visibleEdges = useMemo(
    () => workflow.edges.filter((edge) => !hiddenNodeIds.has(edge.source) && !hiddenNodeIds.has(edge.target)),
    [hiddenNodeIds, workflow.edges],
  );
  const treeRows = useMemo(
    () => treeGridRows(visibleNodes, visibleEdges),
    [visibleEdges, visibleNodes],
  );
  const rovingNodeId = visibleNodes.some((node) => node.id === activeNodeId.current)
    ? activeNodeId.current
    : selected?.kind === "node" && visibleNodes.some((node) => node.id === selected.id)
      ? selected.id
      : treeRows[0]?.node.id ?? null;
  const nodes = useMemo(
    () => treeRows.map(({ node, level }, index) => (
      toFlowNode(node, selected, rovingNodeId, connectionSource, level, index + 1)
    )),
    [connectionSource, rovingNodeId, selected, treeRows],
  );
  const nodeLabels = useMemo(
    () => new Map(visibleNodes.map((node) => [node.id, node.label])),
    [visibleNodes],
  );
  const edges = useMemo(
    () => visibleEdges.map((edge) => toFlowEdge(edge, selected, nodeLabels)),
    [nodeLabels, selected, visibleEdges],
  );
  const selectedNode = selected?.kind === "node"
    ? workflow.nodes.find((node) => node.id === selected.id) ?? null
    : null;

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
    if (nodeReveal) fitCanvas();
  }, [fitCanvas, nodeReveal]);

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

  const toggleNodeSelection = useCallback((nodeId: string) => {
    select(selected?.kind === "node" && selected.id === nodeId
      ? null
      : { kind: "node", id: nodeId });
  }, [select, selected]);

  const setRovingNode = useCallback((nodeId: string, focus = false) => {
    activeNodeId.current = nodeId;
    const rows = Array.from(
      shell.current?.querySelectorAll<HTMLElement>(".react-flow__node[data-id]") ?? [],
    );
    rows.forEach((row) => {
      const isActive = row.dataset.id === nodeId;
      row.tabIndex = isActive ? 0 : -1;
    });
    if (focus) rows.find((row) => row.dataset.id === nodeId)?.focus();
  }, []);

  const configureTreeGrid = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", "Workflow canvas controls");
    const nodeRows = element.querySelector<HTMLElement>(".react-flow__nodes");
    if (!nodeRows) return;
    nodeRows.setAttribute("role", "treegrid");
    nodeRows.setAttribute("aria-label", "Workflow canvas");
    nodeRows.setAttribute("aria-describedby", "workflow-canvas-instructions");
    nodeRows.setAttribute("aria-colcount", "1");
    nodeRows.setAttribute("aria-rowcount", String(visibleNodes.length));
  }, [visibleNodes.length]);

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

  const disconnectEdges = useCallback((edgeIds: string[]) => {
    runCanvasChange(() => apply(
      workflow.revision,
      edgeIds.map((edgeId) => ({ type: "disconnect" as const, edgeId })),
      edgeIds.length === 1 ? "Disconnect edge" : "Disconnect edges",
    ));
  }, [apply, runCanvasChange, workflow.revision]);

  const connectNodesFromKeyboard = useCallback((nodeId: string) => {
    const node = workflow.nodes.find((item) => item.id === nodeId);
    if (!node) return;

    const outputs = nodeDefinitions[node.type].outputs;
    if (!connectionSource) {
      if (outputs.length === 0) {
        reportError(`${node.label} has no output and cannot start a connection.`);
        return;
      }
      const port = outputs[0];
      setConnectionSource({ nodeId: node.id, port });
      reportStatus(outputs.length > 1
        ? `Connection from ${node.label} started using its ${port} output. Press ${connectionKeyboardShortcut} again on ${node.label} to choose another output, or move to another node and press it to connect. Press Escape to cancel.`
        : `Connection from ${node.label} started using its ${port} output. Move to another node and press ${connectionKeyboardShortcut} to connect. Press Escape to cancel.`);
      return;
    }

    if (connectionSource.nodeId === node.id) {
      const currentPortIndex = outputs.indexOf(connectionSource.port);
      const port = outputs[(currentPortIndex + 1) % outputs.length];
      setConnectionSource({ nodeId: node.id, port });
      reportStatus(
        `Connection from ${node.label} will use its ${port} output. Move to another node and press ${connectionKeyboardShortcut} to connect. Press Escape to cancel.`,
      );
      return;
    }

    const source = workflow.nodes.find((item) => item.id === connectionSource.nodeId);
    if (!source) return;
    const sourcePort = connectionSource.port;
    const targetPort = nodeDefinitions[node.type].inputs[0];
    if (!targetPort) {
      reportError(`${node.label} has no input and cannot receive a connection.`);
      return;
    }

    const receipt = apply(workflow.revision, [{
      type: "connect",
      edge: {
        id: `edge-${crypto.randomUUID()}`,
        source: source.id,
        sourcePort,
        target: node.id,
        targetPort,
      },
    }], `Connect ${source.label} to ${node.label}`);
    if (receipt.status !== "completed") return;
    setConnectionSource(null);
    const targetPortDescription = targetPort === "input" ? "input" : `${targetPort} input`;
    reportStatus(
      `Connected ${source.label}'s ${sourcePort} output to ${node.label}'s ${targetPortDescription}.`,
    );
  }, [apply, connectionSource, reportError, reportStatus, setConnectionSource, workflow.nodes, workflow.revision]);

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

  const addNode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const label = String(data.get("label") ?? "").trim();
    const typeValue = String(data.get("type") ?? "action");
    if (!label) {
      reportError("Enter a name for the new node.");
      return;
    }
    if (!isNodeKind(typeValue)) {
      reportError("Choose a valid node type.");
      return;
    }
    const type = typeValue;

    const id = createNodeId(label, workflow.nodes);
    const bounds = shell.current?.getBoundingClientRect();
    const position = flow.current && bounds?.width && bounds.height
      ? flow.current.screenToFlowPosition({
        x: bounds.left + (bounds.width / 2) - 75 + (workflow.nodes.length % 4) * 18,
        y: bounds.top + (bounds.height / 2) - 35 + (workflow.nodes.length % 4) * 18,
      })
      : { x: 120 + (workflow.nodes.length % 5) * 45, y: 120 + (workflow.nodes.length % 4) * 70 };
    const receipt = apply(workflow.revision, [{
      type: "createNode",
      node: {
        id,
        type,
        label,
        position,
        properties: structuredClone(nodeDefinitions[type].defaultProperties),
      },
    }], `Add ${label}`);
    if (receipt.status !== "completed") return;
    form.reset();
    activeNodeId.current = id;
    select({ kind: "node", id }, undefined, true);
  };

  const renameNode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedNode) return;
    const data = new FormData(event.currentTarget);
    const label = String(data.get("label") ?? "").trim();
    if (!label) {
      reportError("Enter a name for the selected node.");
      return;
    }
    if (label === selectedNode.label) return;
    apply(workflow.revision, [{
      type: "updateNode",
      id: selectedNode.id,
      patch: { label },
    }], `Rename ${selectedNode.label} to ${label}`);
  };

  return (
    <>
      <section className="node-editor" aria-labelledby="node-editor-heading">
        <div className="node-editor__heading">
          <h2 id="node-editor-heading">Edit nodes</h2>
          <div className="node-editor__heading-actions">
            <span>{workflow.nodes.length} nodes</span>
            <button
              className="node-editor__clear"
              type="button"
              disabled={workflow.nodes.length === 0 && workflow.edges.length === 0}
              onClick={clear}
            >
              Clear canvas
            </button>
          </div>
        </div>
        <div className="node-editor__forms">
          <form onSubmit={addNode}>
            <label>
              <span>Node type</span>
              <select name="type" defaultValue="action">
                {Object.entries(nodeDefinitions).map(([type, definition]) => (
                  <option key={type} value={type}>{definition.title}</option>
                ))}
              </select>
            </label>
            <label className="node-editor__name">
              <span>New node name</span>
              <input name="label" type="text" maxLength={80} required />
            </label>
            <button type="submit">Add node</button>
          </form>
          <form key={selectedNode ? `${selectedNode.id}:${selectedNode.label}` : "no-node"} onSubmit={renameNode}>
            <label className="node-editor__name">
              <span>Selected node name</span>
              <input
                name="label"
                type="text"
                defaultValue={selectedNode?.label ?? ""}
                maxLength={80}
                required
                disabled={!selectedNode}
              />
            </label>
            <button type="submit" disabled={!selectedNode}>Rename node</button>
          </form>
        </div>
      </section>
      <div ref={shell} className="canvas-shell" aria-label="Visual workflow canvas">
        <p id="workflow-canvas-instructions" className="sr-only">
          Tab once into the workflow tree grid, then use the Arrow keys to navigate between nodes.
          Press Enter or Space to toggle selection. Press {connectionKeyboardShortcut} to start a
          connection. Press it again on the source to choose another output, or move to another
          node and press it to connect. Hold Alt with an Arrow key to move a selected node, or add
          Shift to move it farther. Press Backspace to delete it. Press Escape to cancel a
          connection or clear selection. Tab to navigate to connections and canvas controls.
        </p>
        <ReactFlow
          ref={configureTreeGrid}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesFocusable
          edgesFocusable
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          minZoom={0.05}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            setRovingNode(node.id);
            toggleNodeSelection(node.id);
          }}
          onFocusCapture={(event) => {
            const nodeId = (event.target as HTMLElement)
              .closest<HTMLElement>(".react-flow__node[data-id]")
              ?.dataset.id;
            if (nodeId) setRovingNode(nodeId);
          }}
          onKeyDownCapture={(event) => {
            const target = event.target as HTMLElement;
            const edgeId = target.closest<SVGGElement>(".react-flow__edge[data-id]")?.dataset.id;
            if (edgeId && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              event.stopPropagation();
              select({ kind: "edge", id: edgeId });
              return;
            }
            if (edgeId && event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              select(null);
              return;
            }

            const nodeElement = target.closest<HTMLElement>(
              ".react-flow__node[data-id]",
            );
            const nodeId = nodeElement?.dataset.id;
            if (!nodeId) return;
            if (
              event.key.toLowerCase() === "c"
              && (event.ctrlKey || event.metaKey)
              && !event.altKey
            ) {
              event.preventDefault();
              event.stopPropagation();
              if (!event.repeat) connectNodesFromKeyboard(nodeId);
              return;
            }
            if (isArrowKey(event.key) && !event.altKey) {
              event.preventDefault();
              event.stopPropagation();
              const nextNode = treeGridDestination(nodeId, treeRows, event.key);
              if (nextNode) setRovingNode(nextNode.id, true);
              return;
            }
            if (event.key === "Escape" && connectionSource) {
              event.preventDefault();
              event.stopPropagation();
              setConnectionSource(null);
              reportStatus("Connection canceled.");
              return;
            }
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            toggleNodeSelection(nodeId);
          }}
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
          onEdgesDelete={(items) => disconnectEdges(items.map((edge) => edge.id))}
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
    </>
  );
}
