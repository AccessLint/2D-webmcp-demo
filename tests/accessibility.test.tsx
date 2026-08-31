import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../src/app/App";
import { nodeDefinitions } from "../src/graph/nodeTypes";
import { validateWorkflow } from "../src/graph/validation";
import { createReceipt } from "../src/receipts/createReceipt";
import { workflowStore } from "../src/state/workflowStore";

describe("accessible workflow review", () => {
  beforeEach(() => workflowStore.getState().reset());

  it("renders the workflow canvas, connection controls, and change history surfaces", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Verifiable workflow editing with WebMCP" })).toBeInTheDocument();
    expect(screen.getByText(/This demo shows an agent editing the same workflow/)).toBeInTheDocument();
    expect(screen.getByText(/Add a Retry node with three attempts after Fetch Orders/)).toBeInTheDocument();
    expect(screen.getByRole("application", { name: /Workflow canvas/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Workflow outline" })).not.toBeInTheDocument();
    const connections = screen.getByRole("region", { name: "Workflow connections" });
    expect(within(connections).getByRole("heading", { name: "Workflow connections" })).toBeInTheDocument();
    expect(within(connections).getAllByRole("button")).toHaveLength(3);
  });

  it("exposes every workflow node in the keyboard tab order with an accessible name", async () => {
    render(<App />);
    await waitFor(() => {
      for (const node of workflowStore.getState().workflow.nodes) {
        const renderedNode = screen.getByTestId(`rf__node-${node.id}`);
        expect(renderedNode).toHaveAttribute("tabindex", "0");
        expect(renderedNode).toHaveAttribute("aria-label", `${nodeDefinitions[node.type].title} node: ${node.label}`);
      }
    });
  });

  it("creates one concise receipt for the demo and exposes spot-check controls", async () => {
    const user = userEvent.setup();
    workflowStore.getState().apply(0, [
      { type: "createNode", node: { id: "retry", type: "retry", label: "Retry", position: { x: 525, y: 245 }, properties: { attempts: 3 } } },
      { type: "replaceConnection", edgeId: "edge-fetch-save", replacement: [
        { id: "edge-fetch-retry", source: "fetch-orders", sourcePort: "success", target: "retry", targetPort: "input" },
        { id: "edge-retry-save", source: "retry", sourcePort: "success", target: "save-results", targetPort: "input" },
        { id: "edge-retry-alert", source: "retry", sourcePort: "failure", target: "alert-team", targetPort: "input" },
      ] },
    ], "Add Retry");
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Created Retry and changed 4 connections");
    expect(screen.getByRole("heading", { name: "Most recent change" })).toBeInTheDocument();
    const receiptHeading = screen.getByRole("heading", { name: "Created Retry and changed 4 connections. Workflow validation passed." });
    expect(receiptHeading).toBeInTheDocument();
    const receipt = within(receiptHeading.closest("article")!);
    expect(receipt.queryByText("Agent intent", { exact: false })).not.toBeInTheDocument();
    expect(receipt.queryByText("Exact changes")).not.toBeInTheDocument();
    expect(receipt.getByRole("button", { name: "Mark reviewed" })).toBeInTheDocument();
    expect(receipt.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await user.click(receipt.getByRole("button", { name: "Reveal Retry" }));
    expect(workflowStore.getState().selected).toEqual({ kind: "node", id: "retry" });
  });

  it("shows validation errors and removed objects without dead reveal controls", () => {
    const before = workflowStore.getState().workflow;
    const after = {
      ...before,
      revision: 1,
      nodes: before.nodes.filter((node) => node.id !== "complete"),
      edges: before.edges.filter((edge) => edge.source !== "complete" && edge.target !== "complete"),
    };
    const receipt = createReceipt({ before, after, validation: validateWorkflow(after), intent: "Remove completion" });
    workflowStore.setState({ workflow: after, history: [receipt] });
    render(<App />);
    const receiptHeading = screen.getByRole("heading", { name: "Changed 1 node and changed 1 connection. Workflow validation has errors." });
    const receiptRegion = within(receiptHeading.closest("article")!);
    expect(receiptRegion.getByText("Workflow must contain an End node.")).toBeInTheDocument();
    expect(receiptRegion.getByText("Deleted Complete")).toBeInTheDocument();
    expect(receiptRegion.queryByRole("button", { name: "Reveal Complete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review latest change" })).not.toBeInTheDocument();
  });

  it("shows only the most recent receipt", () => {
    const before = workflowStore.getState().workflow;
    const withTemporary = {
      ...before,
      revision: 1,
      nodes: [...before.nodes, { id: "temporary", type: "action" as const, label: "Temporary", position: { x: 400, y: 400 }, properties: {} }],
    };
    const after = { ...withTemporary, revision: 2, nodes: withTemporary.nodes.filter((node) => node.id !== "temporary") };
    const created = createReceipt({ before, after: withTemporary, validation: validateWorkflow(withTemporary) });
    const deleted = createReceipt({ before: withTemporary, after, validation: validateWorkflow(after) });
    workflowStore.setState({ workflow: after, history: [deleted, created] });
    render(<App />);
    expect(screen.queryByRole("heading", { name: "Created Temporary. Workflow validation passed." })).not.toBeInTheDocument();
    const deletedHeading = screen.getByRole("heading", { name: "Changed 1 node. Workflow validation passed." });
    expect(within(deletedHeading.closest("article")!).getByText("Deleted Temporary")).toBeInTheDocument();
  });
});
