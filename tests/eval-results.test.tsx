import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvalResultsPage } from "../src/components/EvalResultsPage";
import { evalRuns } from "../src/evals/evalRuns";

describe("evaluation results", () => {
  it("shows the latest verified outcomes, report, and latency", () => {
    render(<EvalResultsPage />);

    const latest = screen.getByRole("region", { name: "Current fixture outcomes" });
    expect(within(latest).getAllByText("100%")).toHaveLength(4);
    expect(within(latest).getAllByText("50 of 50 attempts")).toHaveLength(2);
    expect(within(latest).getByRole("link", { name: "Open latest raw report" })).toHaveAttribute(
      "href",
      "/evals/reports/gpt-5.6-terra-current.html",
    );
    expect(within(latest).getByRole("link", { name: "Open latency data (JSON)" })).toHaveAttribute(
      "href",
      "/evals/reports/gpt-5.6-terra-current-latency.json",
    );

    const latency = screen.getByRole("region", { name: "How long successful journeys took" });
    expect(within(latency).getByText("7.06 s")).toBeInTheDocument();
    expect(within(latency).getByText("1.63 s")).toBeInTheDocument();
    expect(within(latency).getByText("28 ms")).toBeInTheDocument();
    expect(within(latency).getByText("2")).toBeInTheDocument();

    const tokens = screen.getByRole("region", { name: "Token usage for successful journeys" });
    expect(within(tokens).getByText("3,366")).toBeInTheDocument();
    expect(within(tokens).getByText("p95 8,439")).toBeInTheDocument();
    expect(within(tokens).getByText("249")).toBeInTheDocument();
    expect(within(tokens).getByText("p95 836")).toBeInTheDocument();

    const comparison = screen.getByRole("region", { name: "What changed from the baseline" });
    expect(within(comparison).getByText("−39.1%")).toBeInTheDocument();
    expect(within(comparison).getByText("−36.5%")).toBeInTheDocument();
    expect(within(comparison).getByText("−9.3%")).toBeInTheDocument();
    expect(within(comparison).getByText("+21.9%")).toBeInTheDocument();
    expect(within(comparison).getByRole("link", { name: "Open pre-trim baseline report" })).toHaveAttribute(
      "href",
      "/evals/reports/gpt-5.6-terra-pre-trim.html",
    );
    expect(screen.getByRole("status")).toHaveTextContent("100% of the latest journeys completed");
  });

  it("does not show the legacy trend section", () => {
    render(<EvalResultsPage />);

    expect(screen.queryByRole("region", { name: "Legacy results over time" })).not.toBeInTheDocument();
    expect(screen.getByText("Baseline")).toBeInTheDocument();
    expect(screen.getByText("Iteration 1")).toBeInTheDocument();
    expect(screen.getByText("Iteration 2")).toBeInTheDocument();
  });

  it("publishes every legacy report linked from the page", () => {
    const missingReports = evalRuns
      .map((run) => run.reportPath)
      .filter((reportPath) => !existsSync(resolve("public", reportPath.slice(1))));

    expect(missingReports).toEqual([]);
  });
});
