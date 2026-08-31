import { useEffect } from "react";
import { evalRuns, type EvalRun } from "../evals/evalRuns";

type Score = { passed: number; total: number };

const percent = ({ passed, total }: Score) => (total === 0 ? 0 : (passed / total) * 100);
const displayPercent = (score: Score) => `${percent(score).toFixed(1).replace(".0", "")}%`;

const metrics: Array<{
  label: string;
  description: string;
  getScore: (run: EvalRun) => Score;
}> = [
  {
    label: "Read the workflow",
    description: "The agent discovered what was on the canvas",
    getScore: (run) => run.journeys.discover,
  },
  {
    label: "Inspect an item",
    description: "The agent inspected Enrich company and its connections",
    getScore: (run) => run.journeys.inspect,
  },
  {
    label: "Reveal an item",
    description: "The agent revealed Enrich company on the canvas",
    getScore: (run) => run.journeys.reveal,
  },
  {
    label: "Focus a control",
    description: "The agent focused the named Zoom In control",
    getScore: (run) => run.journeys.focus,
  },
  {
    label: "Edit and show evidence",
    description: "The agent completed the Retry edit and surfaced its receipt",
    getScore: (run) => run.journeys.retryJourney,
  },
];

function TrendMetric({ label, description, getScore }: (typeof metrics)[number]) {
  const baseline = getScore(evalRuns[0]);
  const latest = getScore(evalRuns.at(-1)!);

  return (
    <article className="eval-metric">
      <div className="eval-metric__heading">
        <div>
          <h3>{label}</h3>
          <p>{description}</p>
        </div>
        <strong>{displayPercent(latest)}</strong>
      </div>
      <div className="eval-run-series" aria-label={`${label} over time`}>
        {evalRuns.map((run) => {
          const score = getScore(run);
          const delta = percent(score) - percent(baseline);
          return (
            <div className="eval-run-point" key={run.id}>
              <div
                className="eval-bar"
                role="img"
                aria-label={`${run.label}: ${score.passed} of ${score.total}, ${displayPercent(score)}`}
              >
                <span style={{ width: `${percent(score)}%` }} />
              </div>
              <div className="eval-run-point__labels">
                <span>{run.label}</span>
                <span>
                  {score.passed}/{score.total}
                  {evalRuns.length > 1 && ` · ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} points`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function EvalResultsPage() {
  const latest = evalRuns.at(-1)!;
  const smoke = latest.deterministicSmoke;

  useEffect(() => {
    const skipLink = document.querySelector<HTMLAnchorElement>("body > .skip-link");
    const previousTitle = document.title;
    if (skipLink) {
      skipLink.href = "#eval-results";
      skipLink.textContent = "Skip to evaluation results";
    }
    document.title = "WebMCP evaluation history";
    return () => {
      if (skipLink) {
        skipLink.href = "#workspace";
        skipLink.textContent = "Skip to workflow workspace";
      }
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="eval-page">
      <nav className="site-nav" aria-label="Primary">
        <a href="/">WebMCP demo</a>
        <a href="/evals" aria-current="page">Evaluation history</a>
      </nav>
      <main id="eval-results">
        <header className="eval-hero">
          <p className="eyebrow">WebMCP eval results</p>
          <h1>Can an AI agent use these tools successfully?</h1>
          <p>
            I run the same tasks several times to see whether the agent chooses the right tools, sends the
            right inputs, and finishes the job. I will keep publishing each comparable run here.
          </p>
          <div className="eval-status" role="status">
            <strong>Improvement measured.</strong> The complex edit-and-evidence journey rose from 0% to 60%,
            while the exact-call score rose from 23.4% to 45.5%.
          </div>
        </header>

        <section className="eval-section" aria-labelledby="model-outcomes-heading">
          <div className="eval-section__heading">
            <div>
              <p className="eyebrow">What happened</p>
              <h2 id="model-outcomes-heading">Results over time</h2>
            </div>
            <p>Each task was attempted 10 times with GPT-5 mini. I checked successful results, not just call order.</p>
          </div>
          <div className="eval-metrics">
            {metrics.map((metric) => <TrendMetric key={metric.label} {...metric} />)}
          </div>
          <p className="eval-note">
            <strong>Complex edit detail:</strong> the Retry edit itself rose from {evalRuns[0].retryEdit.passed}/10
            to {latest.retryEdit.passed}/10 successful attempts. The full journey is lower because four attempts
            did not finish by showing the edit receipt.
          </p>
          <p className="eval-note">
            <strong>Exact-call score:</strong> {evalRuns[0].strictSteps.passed}/{evalRuns[0].strictSteps.total}
            ({displayPercent(evalRuns[0].strictSteps)}) → {latest.strictSteps.passed}/{latest.strictSteps.total}
            ({displayPercent(latest.strictSteps)}). Extra or retried calls count against this diagnostic score,
            so it is not the same as task completion.
          </p>
        </section>

        <section className="eval-section eval-smoke" aria-labelledby="execution-heading">
          <div>
            <p className="eyebrow">Tool check</p>
            <h2 id="execution-heading">Are the tools themselves working?</h2>
            <p>
              Yes. When called with valid inputs, all {smoke.passed}/{smoke.total} browser test steps passed.
              This helps us tell the difference between a broken tool and an agent using a working tool incorrectly.
            </p>
          </div>
          <strong aria-label={`${smoke.passed} of ${smoke.total} steps passed`}>
            {displayPercent(smoke)}
          </strong>
        </section>

        <section className="eval-section" aria-labelledby="runs-heading">
          <div className="eval-section__heading">
            <div>
              <p className="eyebrow">Run details</p>
              <h2 id="runs-heading">What I ran</h2>
            </div>
            <p>The full Chrome report is published so anyone can inspect every call and failure.</p>
          </div>
          <div className="eval-table-wrap">
            <table className="eval-table">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col">Date</th>
                  <th scope="col">Model</th>
                  <th scope="col">Matrix</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {evalRuns.map((run) => (
                  <tr key={run.id}>
                    <th scope="row">{run.label}</th>
                    <td data-label="Date"><time dateTime={run.recordedAt}>{new Date(run.recordedAt).toLocaleDateString("en-US")}</time></td>
                    <td data-label="Model"><code>{run.model}</code></td>
                    <td data-label="Matrix">{run.cases} cases × {run.runsPerCase} runs</td>
                    <td data-label="Evidence"><a href={run.reportPath}>Open raw report</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="eval-note"><strong>What I learned:</strong> {latest.note}</p>
        </section>

        <section className="eval-section" aria-labelledby="method-heading">
          <p className="eyebrow">How I test</p>
          <h2 id="method-heading">Based on Chrome’s WebMCP eval guidance</h2>
          <p className="eval-guidance">
            Chrome recommends checking whether an agent understands a tool, chooses it with the right inputs,
            uses one tool’s result in the next step, and completes the user’s full journey. It also recommends
            ordinary deterministic tests for behavior that does not involve a model. My evaluation follows
            those two tracks. <a href="https://developer.chrome.com/docs/ai/webmcp/evals">Read Chrome’s guidance</a>.
          </p>
          <ol className="eval-method">
            <li>Repeat direct and multi-step tasks to measure probabilistic agent behavior.</li>
            <li>Use deterministic browser tests to verify tool logic and visible side effects.</li>
            <li>Keep the model, tasks, browser, and run count the same when comparing versions.</li>
            <li>Publish task completion, exact-call matching, failures, and the raw report.</li>
          </ol>
          <p className="eval-source">
            Fixture: <a href="https://github.com/AccessLint/webmcp-proof/blob/f5df9d7/evals/webmcp-evals.json"><code>{latest.fixture}</code> at <code>f5df9d7</code></a>
            <span aria-hidden="true"> · </span>
            <span>{latest.backend}, {latest.browser}</span>
          </p>
        </section>
      </main>
    </div>
  );
}
