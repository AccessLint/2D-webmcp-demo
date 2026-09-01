import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvalResultsPage } from "../src/components/EvalResultsPage";

describe("evaluation results", () => {
  it("separates successful outcomes from edit reliability and exact-call matching", () => {
    render(<EvalResultsPage />);

    const breakdown = screen.getByRole("region", { name: "Score breakdown" });
    expect(within(breakdown).getByText("Task completion")).toBeInTheDocument();
    expect(within(breakdown).getByText("47/50")).toBeInTheDocument();
    expect(within(breakdown).getByText("First-attempt edit validity")).toBeInTheDocument();
    expect(within(breakdown).getByText("6/10")).toBeInTheDocument();
    expect(within(breakdown).getByText("Visible edit evidence")).toBeInTheDocument();
    expect(within(breakdown).getByText("10/10")).toBeInTheDocument();
    expect(within(breakdown).getByText("69/173")).toBeInTheDocument();
    expect(within(breakdown).getByText(/needs a fresh run/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("edit evidence reached 10/10");
  });
});
