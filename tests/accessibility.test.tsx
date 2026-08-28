import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../src/app/App";
import { workflowStore } from "../src/state/workflowStore";

describe("accessible workflow review", () => {
  beforeEach(() => workflowStore.getState().reset());

  it("lets a user inspect the seeded workflow outside the canvas", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", { name: "Workflow evidence lab" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Workflow outline" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Inspect Fetch Orders" }));
    expect(screen.getByRole("heading", { name: "Fetch Orders node" })).toBeInTheDocument();
    expect(screen.getByText("Orders API")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connections" })).toBeInTheDocument();
  });

  it("creates one concise receipt for the demo and exposes exact changes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Run Retry demo" }));
    expect(screen.getByRole("status")).toHaveTextContent("Created Retry and changed 4 connections");
    expect(screen.getByRole("heading", { name: "Change history" })).toBeInTheDocument();
    const receiptHeading = screen.getByRole("heading", { name: "Created Retry and changed 4 connections. Workflow validation passed." });
    expect(receiptHeading).toBeInTheDocument();
    await user.click(within(receiptHeading.closest("article")!).getByRole("button", { name: "Inspect Retry" }));
    const inspectorHeading = screen.getByRole("heading", { name: "Retry node" });
    expect(inspectorHeading).toBeInTheDocument();
    expect(within(inspectorHeading.closest("section")!).getByText("3")).toBeInTheDocument();
  });
});
