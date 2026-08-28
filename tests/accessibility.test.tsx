import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../src/app/App";
import { workflowStore } from "../src/state/workflowStore";

describe("accessible workflow review", () => {
  beforeEach(() => workflowStore.getState().reset());

  it("renders only the workflow canvas and change history surfaces", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Workflow editor" })).toBeInTheDocument();
    expect(screen.queryByText("A node editor with receipts you can verify.")).not.toBeInTheDocument();
    expect(screen.getByRole("application", { name: /Workflow canvas/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Workflow outline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connections" })).not.toBeInTheDocument();
  });

  it("creates one concise receipt for the demo and exposes exact changes", async () => {
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
    expect(screen.getByRole("heading", { name: "Change history" })).toBeInTheDocument();
    const receiptHeading = screen.getByRole("heading", { name: "Created Retry and changed 4 connections. Workflow validation passed." });
    expect(receiptHeading).toBeInTheDocument();
    await user.click(within(receiptHeading.closest("article")!).getByRole("button", { name: "Reveal Retry" }));
    expect(workflowStore.getState().selected).toEqual({ kind: "node", id: "retry" });
  });
});
