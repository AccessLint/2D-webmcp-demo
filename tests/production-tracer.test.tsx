import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("production workflow demo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not show the real-run eval tracer", async () => {
    vi.stubEnv("DEV", false);
    const { default: App } = await import("../src/app/App");

    render(<App />);

    expect(screen.queryByText(/Matching eval:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start real-run timing" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Use the page's WebMCP tools to create a software bug triage workflow/)).toHaveLength(1);
  });
});
