import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LiveStatus } from "../src/components/LiveStatus";
import { WorkflowCanvas } from "../src/components/WorkflowCanvas";
import { workflowStore } from "../src/state/workflowStore";

describe("keyboard node connections", () => {
  beforeEach(() => {
    workflowStore.getState().reset();
    workflowStore.setState({
      workflow: {
        revision: 0,
        nodes: [
          { id: "source", type: "node", label: "Source", position: { x: 0, y: 0 }, properties: {} },
          { id: "target", type: "action", label: "Target", position: { x: 240, y: 0 }, properties: {} },
        ],
        edges: [],
      },
      selected: null,
      politeMessage: "",
      assertiveMessage: "",
    });
  });

  it("connects the focused source and destination with the modifier+C shortcut", async () => {
    const user = userEvent.setup();
    render(
      <>
        <LiveStatus />
        <WorkflowCanvas />
      </>,
    );

    const source = screen.getByTestId("rf__node-source");
    const target = screen.getByTestId("rf__node-target");
    expect(source).toHaveAttribute("aria-keyshortcuts", "Control+C Meta+C");

    source.focus();
    await user.keyboard("{Control>}c{/Control}");

    await waitFor(() => {
      expect(source).toHaveAttribute("aria-label", expect.stringContaining("connection source"));
    });
    expect(source.querySelector(".flow-node")).toHaveClass("is-connecting");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Connection from Source started. Move to another node and press Control+C or Command+C to connect. Press Escape to cancel.",
    );

    await user.keyboard("{ArrowDown}");
    expect(target).toHaveFocus();
    await user.keyboard("{Control>}c{/Control}");

    await waitFor(() => {
      expect(workflowStore.getState().workflow.edges).toEqual([
        expect.objectContaining({
          source: "source",
          sourcePort: "next",
          target: "target",
          targetPort: "input",
        }),
      ]);
    });
    expect(target).toHaveFocus();
    expect(source.querySelector(".flow-node")).not.toHaveClass("is-connecting");
    expect(screen.getByRole("status")).toHaveTextContent("Connected Source to Target.");
  });

  it("cancels a pending connection with Escape", async () => {
    const user = userEvent.setup();
    render(
      <>
        <LiveStatus />
        <WorkflowCanvas />
      </>,
    );

    const source = screen.getByTestId("rf__node-source");
    source.focus();
    await user.keyboard("{Control>}c{/Control}");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(source).toHaveAttribute("aria-label", "Node: Source");
    });
    expect(source.querySelector(".flow-node")).not.toHaveClass("is-connecting");
    expect(screen.getByRole("status")).toHaveTextContent("Connection canceled.");
    expect(workflowStore.getState().workflow.edges).toHaveLength(0);
  });

  it("announces when the destination cannot receive a connection", async () => {
    workflowStore.setState((state) => ({
      workflow: {
        ...state.workflow,
        nodes: state.workflow.nodes.map((node) => (
          node.id === "target" ? { ...node, type: "start" as const } : node
        )),
      },
    }));
    const user = userEvent.setup();
    render(
      <>
        <LiveStatus />
        <WorkflowCanvas />
      </>,
    );

    const source = screen.getByTestId("rf__node-source");
    const target = screen.getByTestId("rf__node-target");
    source.focus();
    await user.keyboard("{Control>}c{/Control}{ArrowDown}{Control>}c{/Control}");

    expect(target).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Target has no input and cannot receive a connection.",
    );
    expect(workflowStore.getState().workflow.edges).toHaveLength(0);
    expect(source).toHaveAttribute("aria-label", expect.stringContaining("connection source"));
  });
});
