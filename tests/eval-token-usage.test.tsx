import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvalResultsPage } from "../src/components/EvalResultsPage";

describe("evaluation token usage", () => {
  it("shows input and output token percentiles for successful journeys", () => {
    render(<EvalResultsPage />);

    const tokenUsage = screen.getByRole("region", { name: "Token usage for successful journeys" });
    const inputTokens = within(tokenUsage).getByRole("article", { name: "Input tokens" });
    const outputTokens = within(tokenUsage).getByRole("article", { name: "Output tokens" });

    expect(inputTokens).toHaveTextContent("3,366");
    expect(inputTokens).toHaveTextContent("p95 8,439");
    expect(outputTokens).toHaveTextContent("249");
    expect(outputTokens).toHaveTextContent("p95 836");
  });
});
