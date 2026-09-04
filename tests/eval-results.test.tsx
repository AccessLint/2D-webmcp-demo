import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvalResultsPage } from "../src/components/EvalResultsPage";

describe("evaluation results", () => {
  it("shows the latest verified outcomes, report, and latency", () => {
    render(<EvalResultsPage />);

    const latest = screen.getByRole("region", { name: "Current fixture outcomes" });
    expect(within(latest).getAllByText("100%")).toHaveLength(3);
    expect(within(latest).getByText("84%")).toBeInTheDocument();
    expect(within(latest).getByText("42 of 50 attempts")).toBeInTheDocument();
    expect(within(latest).getByRole("link", { name: "Open latest raw report" })).toHaveAttribute(
      "href",
      "/evals/reports/gpt-5.6-terra-current.html",
    );
    expect(within(latest).getByRole("link", { name: "Open latency data (JSON)" })).toHaveAttribute(
      "href",
      "/evals/reports/gpt-5.6-terra-current-latency.json",
    );

    const latency = screen.getByRole("region", { name: "How long successful journeys took" });
    expect(within(latency).getByText("9.52 s")).toBeInTheDocument();
    expect(within(latency).getByText("1.49 s")).toBeInTheDocument();
    expect(within(latency).getByText("36 ms")).toBeInTheDocument();
    expect(within(latency).getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("100% of the latest journeys completed");
  });

  it("does not show the legacy trend section", () => {
    render(<EvalResultsPage />);

    expect(screen.queryByRole("region", { name: "Legacy results over time" })).not.toBeInTheDocument();
    expect(screen.getByText("Baseline")).toBeInTheDocument();
    expect(screen.getByText("Iteration 1")).toBeInTheDocument();
    expect(screen.getByText("Iteration 2")).toBeInTheDocument();
  });
});
