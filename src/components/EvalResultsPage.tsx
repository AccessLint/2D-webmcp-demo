import { useEffect } from "react";
import { baselineEvalRun, evalRuns, latestEvalRun } from "../evals/evalRuns";

type Score = { passed: number; total: number };

const percent = ({ passed, total }: Score) => (total === 0 ? 0 : (passed / total) * 100);
const displayPercent = (score: Score) => `${percent(score).toFixed(1).replace(".0", "")}%`;
const displaySeconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(2)} s`;
const displayMilliseconds = (milliseconds: number) => `${Math.round(milliseconds)} ms`;
const displayTokens = (tokens: number) => Math.round(tokens).toLocaleString("en-US");
const displayDelta = (current: number, baseline: number) => {
  const value = ((current / baseline) - 1) * 100;
  const sign = value < 0 ? "−" : "+";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
};

export function EvalResultsPage() {
  const latestLegacyRun = evalRuns.at(-1)!;
  const smoke = latestEvalRun.deterministicSmoke;
  const duration = latestEvalRun.latency.durationMs;
  const firstToolCall = latestEvalRun.latency.timeToFirstToolCallMs;
  const toolExecution = latestEvalRun.latency.toolExecutionMs;
  const toolCalls = latestEvalRun.latency.toolCallCount;
  const inputTokens = latestEvalRun.latency.inputTokenCount;
  const outputTokens = latestEvalRun.latency.outputTokenCount;
  const schemaCharacters = latestEvalRun.latency.toolSchemaCharacterCount;
  const baselineDuration = baselineEvalRun.latency.durationMs;
  const baselineInputTokens = baselineEvalRun.latency.inputTokenCount;
  const baselineSchemaCharacters = baselineEvalRun.latency.toolSchemaCharacterCount;

  useEffect(() => {
    const skipLink = document.querySelector<HTMLAnchorElement>("body > .skip-link");
    const previousTitle = document.title;
    if (skipLink) {
      skipLink.href = "#eval-results";
      skipLink.textContent = "Skip to evaluation results";
    }
    document.title = "WebMCP evaluation results";
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
        <a href="/evals" aria-current="page">Evaluation results</a>
      </nav>
      <main id="eval-results">
        <header className="eval-hero">
          <p className="eyebrow">WebMCP eval results</p>
          <h1>Can an AI agent use these tools successfully?</h1>
          <p>
            I run the same tasks several times to see whether the agent chooses the right tools, sends the
            right inputs, and finishes the job. The latest complete run is published here.
          </p>
          <div className="eval-status" role="status">
            <strong>{displayPercent(latestEvalRun.outcomes.all)} of the latest journeys completed.</strong>
            {` Median end-to-end latency was ${displaySeconds(duration.p50)}, and the median first tool call arrived in ${displaySeconds(firstToolCall.p50)}.`}
          </div>
        </header>

        <section className="eval-section" aria-labelledby="latest-run-heading">
          <div className="eval-section__heading">
            <div>
              <p className="eyebrow">Latest report</p>
              <h2 id="latest-run-heading">Current fixture outcomes</h2>
            </div>
            <p>
              {latestEvalRun.cases} creation and editing cases, each attempted {latestEvalRun.runsPerCase} times
              with <code>{latestEvalRun.model}</code>.
            </p>
          </div>
          <div className="eval-latest-grid">
            <article className="eval-score-card">
              <p>All journeys</p>
              <strong>{displayPercent(latestEvalRun.outcomes.all)}</strong>
              <span>{latestEvalRun.outcomes.all.passed} of {latestEvalRun.outcomes.all.total} attempts</span>
              <small>Verified the requested workflow outcome, not only the expected call sequence.</small>
            </article>
            <article className="eval-score-card">
              <p>Create journeys</p>
              <strong>{displayPercent(latestEvalRun.outcomes.create)}</strong>
              <span>{latestEvalRun.outcomes.create.passed} of {latestEvalRun.outcomes.create.total} attempts</span>
              <small>10 small two-step workflows and 10 larger branching workflows.</small>
            </article>
            <article className="eval-score-card">
              <p>Edit journeys</p>
              <strong>{displayPercent(latestEvalRun.outcomes.edit)}</strong>
              <span>{latestEvalRun.outcomes.edit.passed} of {latestEvalRun.outcomes.edit.total} attempts</span>
              <small>Adding, rerouting, and paginated inspection-and-edit tasks.</small>
            </article>
            <article className="eval-score-card">
              <p>Efficient trajectories</p>
              <strong>{displayPercent(latestEvalRun.outcomes.efficient)}</strong>
              <span>{latestEvalRun.outcomes.efficient.passed} of {latestEvalRun.outcomes.efficient.total} attempts</span>
              <small>Completed every required call without a failed expected step.</small>
            </article>
          </div>
          <div className="eval-evidence-links">
            <a href={latestEvalRun.reportPath}>Open latest raw report</a>
            <a href={latestEvalRun.latencyPath}>Open latency data (JSON)</a>
          </div>
          <p className="eval-note"><strong>What I learned:</strong> {latestEvalRun.note}</p>
        </section>

        <section className="eval-section" aria-labelledby="latency-heading">
          <div className="eval-section__heading">
            <div>
              <p className="eyebrow">Latest latency</p>
              <h2 id="latency-heading">How long successful journeys took</h2>
            </div>
            <p>Percentiles include the {latestEvalRun.outcomes.all.passed} verified successful attempts in the latest report.</p>
          </div>
          <div className="eval-latency-grid">
            <article className="eval-latency-card">
              <p>End to end</p>
              <strong>{displaySeconds(duration.p50)}</strong>
              <span>p50</span>
              <small>p95 {displaySeconds(duration.p95)}</small>
            </article>
            <article className="eval-latency-card">
              <p>First tool call</p>
              <strong>{displaySeconds(firstToolCall.p50)}</strong>
              <span>p50</span>
              <small>p95 {displaySeconds(firstToolCall.p95)}</small>
            </article>
            <article className="eval-latency-card">
              <p>Tool execution</p>
              <strong>{displayMilliseconds(toolExecution.p50)}</strong>
              <span>p50</span>
              <small>p95 {displayMilliseconds(toolExecution.p95)}</small>
            </article>
            <article className="eval-latency-card">
              <p>Tool calls</p>
              <strong>{toolCalls.p50}</strong>
              <span>median calls per attempt</span>
              <small>p95 {toolCalls.p95} calls</small>
            </article>
          </div>
          <p className="eval-note">
            All 50 attempts reached the requested end state. Tool-call counts also cover all 50 attempts.
          </p>
        </section>

        <section className="eval-section" aria-labelledby="token-usage-heading">
          <div className="eval-section__heading">
            <div>
              <p className="eyebrow">Latest token usage</p>
              <h2 id="token-usage-heading">Token usage for successful journeys</h2>
            </div>
            <p>Counts combine every model step in each of the {latestEvalRun.outcomes.all.passed} verified successful attempts.</p>
          </div>
          <div className="eval-latency-grid">
            <article className="eval-latency-card" aria-label="Input tokens">
              <p>Input tokens</p>
              <strong>{displayTokens(inputTokens.p50)}</strong>
              <span>p50 per attempt</span>
              <small>p95 {displayTokens(inputTokens.p95)}</small>
            </article>
            <article className="eval-latency-card" aria-label="Output tokens">
              <p>Output tokens</p>
              <strong>{displayTokens(outputTokens.p50)}</strong>
              <span>p50 per attempt</span>
              <small>p95 {displayTokens(outputTokens.p95)}</small>
            </article>
          </div>
        </section>

        <section className="eval-section" aria-labelledby="comparison-heading">
          <div className="eval-section__heading">
            <div>
              <p className="eyebrow">Before and after</p>
              <h2 id="comparison-heading">What changed from the baseline</h2>
            </div>
            <p>The model, browser, five cases, and 10 runs per case stayed fixed while the WebMCP interface was reduced.</p>
          </div>
          <div className="eval-latency-grid">
            <article className="eval-latency-card">
              <p>Mean input tokens</p>
              <strong>{displayDelta(inputTokens.mean, baselineInputTokens.mean)}</strong>
              <span>{displayTokens(baselineInputTokens.mean)} → {displayTokens(inputTokens.mean)}</span>
            </article>
            <article className="eval-latency-card">
              <p>Mean schema exposure</p>
              <strong>{displayDelta(schemaCharacters.mean, baselineSchemaCharacters.mean)}</strong>
              <span>{displayTokens(baselineSchemaCharacters.mean)} → {displayTokens(schemaCharacters.mean)} characters</span>
            </article>
            <article className="eval-latency-card">
              <p>Median end to end</p>
              <strong>{displayDelta(duration.p50, baselineDuration.p50)}</strong>
              <span>{displaySeconds(baselineDuration.p50)} → {displaySeconds(duration.p50)}</span>
            </article>
            <article className="eval-latency-card eval-latency-card--warning">
              <p>p95 end to end</p>
              <strong>{displayDelta(duration.p95, baselineDuration.p95)}</strong>
              <span>{displaySeconds(baselineDuration.p95)} → {displaySeconds(duration.p95)}</span>
            </article>
          </div>
          <div className="eval-evidence-links">
            <a href={baselineEvalRun.reportPath}>Open pre-trim baseline report</a>
            <a href={baselineEvalRun.latencyPath}>Open baseline latency data (JSON)</a>
          </div>
          <p className="eval-note">
            Semantic success stayed at 100%; efficient trajectories improved from 49 of 50 to 50 of 50.
            Median latency improved, while p95 latency increased but remained below the 20-second project limit.
          </p>
        </section>

        <section className="eval-section eval-smoke" aria-labelledby="execution-heading">
          <div>
            <p className="eyebrow">Tool check</p>
            <h2 id="execution-heading">Are the tools themselves working?</h2>
            <p>
              Yes. When called with valid inputs, {displayPercent(smoke)} of browser test steps passed
              ({smoke.passed} of {smoke.total}).
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
                <tr>
                  <th scope="row">{latestEvalRun.label}</th>
                  <td data-label="Date"><time dateTime={latestEvalRun.recordedAt}>{new Date(latestEvalRun.recordedAt).toLocaleDateString("en-US")}</time></td>
                  <td data-label="Model"><code>{latestEvalRun.model}</code></td>
                  <td data-label="Matrix">{latestEvalRun.cases} cases × {latestEvalRun.runsPerCase} runs</td>
                  <td data-label="Evidence">
                    <a href={latestEvalRun.reportPath}>Raw report</a>
                    <span aria-hidden="true"> · </span>
                    <a href={latestEvalRun.latencyPath}>Latency JSON</a>
                  </td>
                </tr>
                <tr>
                  <th scope="row">{baselineEvalRun.label}</th>
                  <td data-label="Date"><time dateTime={baselineEvalRun.recordedAt}>{new Date(baselineEvalRun.recordedAt).toLocaleDateString("en-US")}</time></td>
                  <td data-label="Model"><code>{baselineEvalRun.model}</code></td>
                  <td data-label="Matrix">{baselineEvalRun.cases} cases × {baselineEvalRun.runsPerCase} runs</td>
                  <td data-label="Evidence">
                    <a href={baselineEvalRun.reportPath}>Raw report</a>
                    <span aria-hidden="true"> · </span>
                    <a href={baselineEvalRun.latencyPath}>Latency JSON</a>
                  </td>
                </tr>
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
          <p className="eval-note"><strong>Legacy takeaway:</strong> {latestLegacyRun.note}</p>
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
            Fixture: <a href="https://github.com/AccessLint/webmcp-proof/blob/main/evals/webmcp-evals.json"><code>{latestEvalRun.fixture}</code></a>
            <span aria-hidden="true"> · </span>
            <span>{latestEvalRun.backend}, {latestEvalRun.browser}</span>
          </p>
        </section>
      </main>
    </div>
  );
}
