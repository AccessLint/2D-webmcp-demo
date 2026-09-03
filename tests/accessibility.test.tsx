import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../src/app/App";
import { createReceipt } from "../src/receipts/createReceipt";
import { workflowStore } from "../src/state/workflowStore";
import { createSalesWorkflow } from "./fixtures/salesWorkflow";

describe("accessible workflow editor", () => {
  beforeEach(() => workflowStore.getState().reset());

  it("renders the workflow canvas and change history surfaces without duplicate connection controls", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Verifiable workflow editing with WebMCP" })).toBeInTheDocument();
    expect(screen.getByText(/This demo shows an agent editing the same workflow/)).toBeInTheDocument();
    expect(screen.getByText(/accessibility for screen reader users is a primary design goal/)).toBeInTheDocument();
    expect(screen.getByText(/leads disappear whenever company enrichment is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/just three types—Node, Action, and Condition/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy prompt" })).toBeInTheDocument();
    expect(screen.getByRole("treegrid", { name: /Workflow canvas/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Workflow outline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Workflow connections" })).not.toBeInTheDocument();
  });

  it("exposes canvas nodes as a treegrid with one tab stop and tree arrow navigation", async () => {
    workflowStore.setState({
      workflow: {
        revision: 0,
        nodes: [
          { id: "root", type: "node", label: "Root", position: { x: 0, y: 0 }, properties: {} },
          { id: "right", type: "action", label: "Right", position: { x: 240, y: 0 }, properties: {} },
          { id: "down", type: "condition", label: "Down", position: { x: 0, y: 180 }, properties: {} },
        ],
        edges: [
          { id: "root-right", source: "root", sourcePort: "next", target: "right", targetPort: "input" },
          { id: "root-down", source: "root", sourcePort: "next", target: "down", targetPort: "input" },
        ],
      },
      selected: null,
    });
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("treegrid", { name: "Workflow canvas" })).toBeInTheDocument();
    });
    const root = screen.getByTestId("rf__node-root");
    const right = screen.getByTestId("rf__node-right");
    const down = screen.getByTestId("rf__node-down");
    expect(root).toHaveAttribute("role", "row");
    expect(root).toHaveAttribute("aria-label", "Node: Root");
    expect(right).toHaveAttribute("role", "row");
    expect(right).toHaveAttribute("aria-label", "Action node: Right");
    expect(down).toHaveAttribute("role", "row");
    expect(down).toHaveAttribute("aria-label", "Condition node: Down");
    expect(root.querySelector('[role="gridcell"]')).toBeInTheDocument();
    expect(root).toHaveAttribute("aria-level", "1");
    expect(right).toHaveAttribute("aria-level", "2");
    expect(root).toHaveAttribute("tabindex", "0");
    expect(right).toHaveAttribute("tabindex", "-1");
    expect(down).toHaveAttribute("tabindex", "-1");

    root.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(right).toHaveFocus());
    expect(root).toHaveAttribute("tabindex", "-1");
    expect(right).toHaveAttribute("tabindex", "0");

    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(root).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(right).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(down).toHaveFocus());
    await user.keyboard("{ArrowUp}");
    await waitFor(() => expect(right).toHaveFocus());
    expect(root).toHaveStyle({ transform: "translate(0px,0px)" });

    await user.tab();
    expect(root).not.toHaveFocus();
    expect(right).not.toHaveFocus();
    expect(down).not.toHaveFocus();
  });

  it("adds a named node from the node editing controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Node type" }), "node");
    await user.type(screen.getByRole("textbox", { name: "New node name" }), "Checkpoint");
    await user.click(screen.getByRole("button", { name: "Add node" }));

    const created = workflowStore.getState().workflow.nodes.find(
      (node) => node.label === "Checkpoint",
    );
    expect(created).toMatchObject({ type: "node", properties: {} });
    expect(workflowStore.getState().selected).toEqual({ kind: "node", id: created?.id });
    expect(screen.getByRole("textbox", { name: "New node name" })).toHaveValue("");
    await waitFor(() => {
      expect(screen.getByTestId(`rf__node-${created?.id}`)).toHaveAttribute(
        "aria-label",
        "Node: Checkpoint",
      );
    });
  });

  it("offers and creates the priority workflow node types", async () => {
    const user = userEvent.setup();
    render(<App />);

    const typePicker = screen.getByRole("combobox", { name: "Node type" });
    expect(within(typePicker).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Node",
      "Action",
      "Condition",
      "Start",
      "End",
      "Input",
      "Output",
      "Subprocess",
      "Parallel Gateway",
      "Data Store",
    ]);

    await user.selectOptions(typePicker, "parallel-gateway");
    await user.type(screen.getByRole("textbox", { name: "New node name" }), "Run checks");
    await user.click(screen.getByRole("button", { name: "Add node" }));

    const created = workflowStore.getState().workflow.nodes.find(
      (node) => node.label === "Run checks",
    );
    expect(created).toMatchObject({ type: "parallel-gateway", properties: {} });
    await waitFor(() => {
      expect(screen.getByTestId(`rf__node-${created?.id}`)).toHaveAttribute(
        "aria-label",
        "Parallel Gateway node: Run checks",
      );
    });
  });

  it("renames the selected node without changing its identity or connections", async () => {
    workflowStore.setState({
      workflow: createSalesWorkflow(),
      selected: { kind: "node", id: "enrich-company" },
    });
    const user = userEvent.setup();
    render(<App />);

    const renameInput = screen.getByRole("textbox", { name: "Selected node name" });
    expect(renameInput).toHaveValue("Enrich company");
    await user.clear(renameInput);
    await user.type(renameInput, "Research company");
    await user.click(screen.getByRole("button", { name: "Rename node" }));

    const state = workflowStore.getState().workflow;
    expect(state.nodes.find((node) => node.id === "enrich-company")?.label).toBe("Research company");
    expect(state.edges.some((edge) => edge.source === "enrich-company")).toBe(true);
    await waitFor(() => {
      expect(screen.getByTestId("rf__node-enrich-company")).toHaveAttribute(
        "aria-label",
        "Action node: Research company",
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent("Renamed Enrich company to Research company");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("textbox", { name: "Selected node name" })).toHaveValue("Enrich company");
  });

  it("creates one concise receipt for the demo and exposes spot-check controls", async () => {
    workflowStore.setState({ workflow: createSalesWorkflow() });
    const user = userEvent.setup();
    workflowStore.getState().apply(0, [
      { type: "createNode", node: { id: "notify-sales", type: "action", label: "Notify sales", position: { x: 900, y: 100 }, properties: {} } },
      { type: "replaceConnection", edgeId: "edge-opportunity-end", replacement: [
        { id: "edge-opportunity-notify", source: "create-opportunity", sourcePort: "success", target: "notify-sales", targetPort: "input" },
        { id: "edge-notify-complete", source: "notify-sales", sourcePort: "success", target: "complete", targetPort: "input" },
      ] },
    ], "Add Notify sales");
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Created Notify sales and changed 3 connections");
    expect(screen.getByRole("heading", { name: "Most recent change" })).toBeInTheDocument();
    const receiptHeading = screen.getByRole("heading", { name: "Created Notify sales and changed 3 connections." });
    expect(receiptHeading).toBeInTheDocument();
    const receipt = within(receiptHeading.closest("article")!);
    expect(receipt.queryByText("Agent intent", { exact: false })).not.toBeInTheDocument();
    expect(receipt.queryByText("Exact changes")).not.toBeInTheDocument();
    expect(receipt.queryByRole("button", { name: "Mark reviewed" })).not.toBeInTheDocument();
    expect(receipt.queryByText(/reviewed/i)).not.toBeInTheDocument();
    expect(receipt.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    await user.click(receipt.getByRole("button", { name: "Reveal Notify sales" }));
    expect(workflowStore.getState().selected).toEqual({ kind: "node", id: "notify-sales" });
  });

  it("shows removed objects without dead reveal controls", () => {
    workflowStore.setState({ workflow: createSalesWorkflow() });
    const before = workflowStore.getState().workflow;
    const after = {
      ...before,
      revision: 1,
      nodes: before.nodes.filter((node) => node.id !== "complete"),
      edges: before.edges.filter((edge) => edge.source !== "complete" && edge.target !== "complete"),
    };
    const receipt = createReceipt({ before, after, intent: "Remove completion" });
    workflowStore.setState({ workflow: after, history: [receipt] });
    render(<App />);
    const receiptHeading = screen.getByRole("heading", { name: "Changed 1 node and changed 2 connections." });
    const receiptRegion = within(receiptHeading.closest("article")!);
    expect(receiptRegion.getByText("Deleted Complete")).toBeInTheDocument();
    expect(receiptRegion.queryByRole("button", { name: "Reveal Complete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review latest change" })).not.toBeInTheDocument();
  });

  it("shows only the most recent receipt", () => {
    workflowStore.setState({ workflow: createSalesWorkflow() });
    const before = workflowStore.getState().workflow;
    const withTemporary = {
      ...before,
      revision: 1,
      nodes: [...before.nodes, { id: "temporary", type: "action" as const, label: "Temporary", position: { x: 400, y: 400 }, properties: {} }],
    };
    const after = { ...withTemporary, revision: 2, nodes: withTemporary.nodes.filter((node) => node.id !== "temporary") };
    const created = createReceipt({ before, after: withTemporary });
    const deleted = createReceipt({ before: withTemporary, after });
    workflowStore.setState({ workflow: after, history: [deleted, created] });
    render(<App />);
    expect(screen.queryByRole("heading", { name: "Created Temporary." })).not.toBeInTheDocument();
    const deletedHeading = screen.getByRole("heading", { name: "Changed 1 node." });
    expect(within(deletedHeading.closest("article")!).getByText("Deleted Temporary")).toBeInTheDocument();
  });
});
