import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvalResultsPage } from "../src/components/EvalResultsPage";

describe("evaluation results", () => {
  it("shows the latest verified outcomes, report, and latency", () => {
    render(<EvalResultsPage />);

    const latest = screen.getByRole("region", { name: "Current fixture outcomes" });
    expect(within(latest).getByText("88%")).toBeInTheDocument();
    expect(within(latest).getByText("100%")).toBeInTheDocument();
    expect(within(latest).getByText("80%")).toBeInTheDocument();
    expect(within(latest).getByRole("link", { name: "Open latest raw report" })).toHaveAttribute(
      "href",
      "/evals/reports/gpt-5.6-terra-current.html",
    );
    expect(within(latest).getByRole("link", { name: "Open latency data (JSON)" })).toHaveAttribute(
      "href",
      "/evals/reports/gpt-5.6-terra-current-latency.json",
    );

    const latency = screen.getByRole("region", { name: "How long successful journeys took" });
    expect(within(latency).getByText("12.77 s")).toBeInTheDocument();
    expect(within(latency).getByText("1.55 s")).toBeInTheDocument();
    expect(within(latency).getByText("35 ms")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("88% of the latest journeys completed");
  });

  it("does not show the legacy score breakdown", () => {
    render(<EvalResultsPage />);

    expect(screen.queryByRole("region", { name: "Legacy score breakdown" })).not.toBeInTheDocument();
  });
});
