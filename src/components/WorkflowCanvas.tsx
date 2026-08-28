import { useEffect, useMemo, useRef } from "react";
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeDefinitions } from "../graph/nodeTypes";
import { useWorkflowStore } from "../state/workflowStore";

type CardData = { label: string; kind: keyof typeof nodeDefinitions; properties: Record<string, string | number | boolean> };

function WorkflowCard({ data, selected }: NodeProps<Node<CardData>>) {
  const definition = nodeDefinitions[data.kind];
  return <div className={`flow-node flow-node--${data.kind}${selected ? " is-selected" : ""}`}>
    {definition.inputs.map((port, index) => <Handle key={port} id={port} type="target" position={Position.Left} style={{ top: `${((index + 1) / (definition.inputs.length + 1)) * 100}%` }} aria-label={`${port} input`} />)}
    <span className="flow-node__type">{definition.title}</span>
    <strong>{data.label}</strong>
    {data.properties.attempts ? <span className="flow-node__meta">{String(data.properties.attempts)} attempts</span> : null}
    {definition.outputs.map((port, index) => <Handle key={port} id={port} type="source" position={Position.Right} style={{ top: `${((index + 1) / (definition.outputs.length + 1)) * 100}%` }} aria-label={`${port} output`} />)}
  </div>;
}

const nodeTypes = { workflow: WorkflowCard };

export function WorkflowCanvas() {
  const workflow = useWorkflowStore((state) => state.workflow);
  const selected = useWorkflowStore((state) => state.selected);
  const focusRequest = useWorkflowStore((state) => state.focusRequest);
  const apply = useWorkflowStore((state) => state.apply);
  const select = useWorkflowStore((state) => state.select);
  const reportError = useWorkflowStore((state) => state.reportError);
  const flow = useRef<ReactFlowInstance<Node<CardData>, Edge> | null>(null);
  const nodes = useMemo<Node<CardData>[]>(() => workflow.nodes.map((node) => ({
    id: node.id, type: "workflow", position: node.position, data: { label: node.label, kind: node.type, properties: node.properties }, selected: selected?.kind === "node" && selected.id === node.id,
  })), [workflow.nodes, selected]);
  const edges = useMemo<Edge[]>(() => workflow.edges.map((edge) => ({
    id: edge.id, source: edge.source, sourceHandle: edge.sourcePort, target: edge.target, targetHandle: edge.targetPort,
    label: edge.label ?? edge.sourcePort, selected: selected?.kind === "edge" && selected.id === edge.id,
  })), [workflow.edges, selected]);
  useEffect(() => {
    if (!focusRequest || !selected || !flow.current) return;
    const nodeIds = selected.kind === "node" ? [selected.id] : workflow.edges.filter((edge) => edge.id === selected.id).flatMap((edge) => [edge.source, edge.target]);
    if (nodeIds.length) void flow.current.fitView({ nodes: nodeIds.map((id) => ({ id })), padding: .8, duration: 300, maxZoom: 1.1 });
  }, [focusRequest, selected, workflow.edges]);
  const safely = (task: () => void) => { try { task(); } catch (error) { reportError(error instanceof Error ? error.message : "The canvas change failed."); } };
  const onConnect = (connection: Connection) => safely(() => apply(workflow.revision, [{ type: "connect", edge: { id: `edge-${crypto.randomUUID()}`, source: connection.source, sourcePort: connection.sourceHandle ?? "success", target: connection.target, targetPort: connection.targetHandle ?? "input" } }], "Canvas connection"));
  return <div className="canvas-shell" aria-label="Visual workflow canvas">
    <ReactFlow
      nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.25} maxZoom={1.5} proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => select({ kind: "node", id: node.id })}
      onEdgeClick={(_, edge) => select({ kind: "edge", id: edge.id })}
      onNodeDragStop={(_, node) => safely(() => apply(workflow.revision, [{ type: "updateNode", id: node.id, patch: { position: node.position } }], "Move node"))}
      onConnect={onConnect}
      onInit={(instance) => { flow.current = instance; }}
      onNodesDelete={(items) => safely(() => apply(workflow.revision, items.map((node) => ({ type: "deleteNode" as const, id: node.id })), "Delete nodes"))}
      onEdgesDelete={(items) => safely(() => apply(workflow.revision, items.map((edge) => ({ type: "disconnect" as const, edgeId: edge.id })), "Disconnect edges"))}
      aria-label="Workflow canvas"
    >
      <Background color="#2d4254" gap={24} size={1} />
      <MiniMap pannable zoomable nodeColor="#c8ff80" bgColor="#0b151d" maskColor="rgba(6, 13, 20, .72)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
