import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../src/app/App";
import { workflowStore } from "../src/state/workflowStore";

describe("clear canvas", () => {
  beforeEach(() => workflowStore.getState().reset());

  it("clears the canvas and can be undone", async () => {
    const user = userEvent.setup();
    render(<App />);

    const clearButton = screen.getByRole("button", { name: "Clear canvas" });
    await user.click(clearButton);

    expect(workflowStore.getState().workflow.nodes).toEqual([]);
    expect(workflowStore.getState().workflow.edges).toEqual([]);
    expect(workflowStore.getState().selected).toBeNull();
    expect(clearButton).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Cleared the canvas");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(workflowStore.getState().workflow.nodes).not.toHaveLength(0);
    expect(clearButton).toBeEnabled();
  });

  it("can clear an edge-only hydrated canvas", async () => {
    const user = userEvent.setup();
    workflowStore.setState({
      workflow: {
        revision: 4,
        nodes: [],
        edges: [{
          id: "orphaned-edge",
          source: "missing-source",
          sourcePort: "success",
          target: "missing-target",
          targetPort: "input",
        }],
      },
      selected: null,
    });
    render(<App />);

    const clearButton = screen.getByRole("button", { name: "Clear canvas" });
    expect(clearButton).toBeEnabled();
    await user.click(clearButton);

    expect(workflowStore.getState().workflow.edges).toEqual([]);
    expect(clearButton).toBeDisabled();
  });
});
