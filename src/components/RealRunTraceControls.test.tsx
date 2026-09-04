import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RealRunTraceControls } from "./RealRunTraceControls";

describe("real-run trace controls", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records the prompt-to-final window and downloads its trace", () => {
    const createObjectUrl = vi.fn(() => "blob:real-run-trace");
    const revokeObjectUrl = vi.fn();
    const clickDownload = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });

    render(<RealRunTraceControls
      caseName="Create a complex multi-branch bug workflow"
      prompt="Create the workflow."
    />);

    expect(screen.getByText("Matching eval: Create a complex multi-branch bug workflow")).toBeInTheDocument();
    expect(screen.getByText("Create the workflow.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start real-run timing" }));
    expect(screen.getByText("Timing the ChatGPT run from prompt submission to final response.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop real-run timing" }));
    expect(screen.getByText("Timing stopped. Classify the result, then download the trace.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Observed task result" }), {
      target: { value: "success" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Download trace" }));
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(clickDownload).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:real-run-trace");
    expect(screen.getByText("Trace downloaded. Apply it to the eval latency report from the command line.")).toBeInTheDocument();
  });
});
