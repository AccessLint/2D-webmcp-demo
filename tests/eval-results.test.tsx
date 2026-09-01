import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvalResultsPage } from "../src/components/EvalResultsPage";

describe("evaluation results", () => {
  it("separates successful outcomes from edit reliability and exact-call matching", () => {
    render(<EvalResultsPage />);

    const breakdown = screen.getByRole("region", { name: "Score breakdown" });
    const taskCompletion = within(breakdown).getByText("Task completion").closest("article")!;
    expect(within(taskCompletion).getByText("94%")).toBeInTheDocument();
    const editValidity = within(breakdown).getByText("First-attempt edit validity").closest("article")!;
    expect(within(editValidity).getByText("60%")).toBeInTheDocument();
    const visibleEvidence = within(breakdown).getByText("Visible edit evidence").closest("article")!;
    expect(within(visibleEvidence).getByText("100%")).toBeInTheDocument();
    const exactCalls = within(breakdown).getByText("Exact-call matching").closest("article")!;
    expect(within(exactCalls).getByText("39.9%")).toBeInTheDocument();
    expect(within(breakdown).getByText(/needs a fresh run/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("edit evidence reached 100%");
  });
});
