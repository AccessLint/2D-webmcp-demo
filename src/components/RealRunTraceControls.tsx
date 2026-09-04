import { useState } from "react";
import {
  realRunTracer,
  type RealRunOutcome,
  type RealRunTrace,
} from "../evals/realRunTrace";

type TraceStatus = "idle" | "recording" | "stopped" | "downloaded";

function downloadTrace(trace: RealRunTrace) {
  const contents = `${JSON.stringify(trace, null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const download = document.createElement("a");
  download.href = url;
  download.download = `real-run-${trace.id}.json`;
  download.click();
  URL.revokeObjectURL(url);
}

export function RealRunTraceControls({ caseName, prompt }: { caseName: string; prompt: string }) {
  const [status, setStatus] = useState<TraceStatus>("idle");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [outcome, setOutcome] = useState<RealRunOutcome>("unverified");
  const [trace, setTrace] = useState<RealRunTrace | null>(null);

  const start = () => {
    realRunTracer.start({ caseName, prompt });
    setTrace(null);
    setOutcome("unverified");
    setStatus("recording");
  };

  const stop = () => {
    setTrace(realRunTracer.finish());
    setStatus("stopped");
  };

  const download = () => {
    if (!trace) return;
    downloadTrace({ ...trace, outcome });
    setStatus("downloaded");
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <div className="real-run-trace" aria-label="Real ChatGPT run timing">
      <p>
        Compare this already-loaded page in ChatGPT with the matching eval. Start as you submit the prompt,
        then stop after ChatGPT’s final response appears. Manual reaction time remains part of the observation.
      </p>
      <details>
        <summary>Matching eval: {caseName}</summary>
        <blockquote>{prompt}</blockquote>
        <button type="button" onClick={() => void copyPrompt()}>
          {copyStatus === "copied" ? "Copied eval prompt" : copyStatus === "failed" ? "Copy failed" : "Copy exact eval prompt"}
        </button>
      </details>
      <div className="real-run-trace__actions">
        <button type="button" onClick={start} disabled={status === "recording" || status === "stopped"}>
          Start real-run timing
        </button>
        <button type="button" onClick={stop} disabled={status !== "recording"}>
          Stop real-run timing
        </button>
        <button type="button" onClick={download} disabled={status !== "stopped"}>
          Download trace
        </button>
      </div>
      <label className="real-run-trace__outcome">
        Observed task result
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as RealRunOutcome)}
          disabled={status !== "stopped"}
        >
          <option value="unverified">Not verified</option>
          <option value="success">Successful</option>
          <option value="failure">Failed or incomplete</option>
        </select>
      </label>
      <p className="real-run-trace__status" aria-live="polite">
        {status === "recording"
          ? "Timing the ChatGPT run from prompt submission to final response."
          : status === "stopped"
            ? "Timing stopped. Classify the result, then download the trace."
          : status === "downloaded"
            ? "Trace downloaded. Apply it to the eval latency report from the command line."
            : "No run is being timed."}
      </p>
    </div>
  );
}
