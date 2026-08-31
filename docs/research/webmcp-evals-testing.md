# Testing this application with WebMCP Evals

## Recommendation

Use three complementary layers:

1. Keep the existing Vitest and Playwright suites as deterministic tests of graph logic, tool handlers, receipts, focus, and UI side effects.
2. Add a `webmcp-evals` browser suite that tests whether a model selects the right tools, supplies valid arguments, and follows the required multi-step workflow.
3. Run the same browser suite in `smoke` mode in CI to execute the authored calls without an LLM, then run repeated model-backed evaluations on a schedule or before releases.

This split follows Chrome's guidance: ordinary application behavior should retain deterministic tests, while model-dependent tool selection and sequencing require probabilistic evals. [Chrome: Evals for WebMCP](https://developer.chrome.com/docs/ai/webmcp/evals)

## Existing coverage

The repository already covers most deterministic behavior:

- `tests/webmcp.test.ts` tests discovery, inspection, editing, evidence retrieval, focus, reveal, undo, schemas, and structured recovery errors.
- `tests/e2e/demo-flow.spec.ts` exercises the Retry edit, receipt focus, UI state, and undo in Chromium.
- `evals/surfaceBridge.ts` provides an isolated two-tool adapter for comparing the generic, workflow-specific, and draft Surface Snapshot/Receipt representations.

The missing layer is a model runner with natural-language prompts and expected tool-call trajectories.

## Suggested evaluation cases

Create `evals/webmcp-evals.json` with realistic prompt variations for these behaviors:

- Discovery: a request to inspect or summarize the workflow should begin with `discover_workflow`.
- Inspection: a relationship question should call `discover_workflow`, then `inspect_workflow_items` with copied stable IDs.
- Main edit journey: the Retry prompt from `docs/TESTING.md` should call `discover_workflow`, `edit_workflow`, and `show_edit_result` in order.
- Argument accuracy: the edit must use revision `0`, create a Retry node with `attempts: 3`, replace `edge-enrich-qualified`, and route success/failure correctly. Coordinates and generated operation IDs should use matcher constraints rather than exact values.
- Page focus: “Put keyboard focus on Zoom In” should discover targets and call `focus_page_element` with `targetId: "canvas.zoom-in"`.
- Reveal: after creating Retry, “Show the Retry workflow node” should call `show_workflow_item` with the new node ID.
- Undo: after an edit, the model should pass the returned operation ID to `undo_workflow_edit`.
- Recovery: stale revisions, unknown IDs, and invalid arguments should lead back to `discover_workflow` rather than guessing.
- Negative selection: unrelated prompts should not call mutating workflow tools.

Include both direct and paraphrased/ambiguous prompts. Chrome explicitly recommends both baseline direct queries and open-ended queries that exercise model reasoning. [Chrome: Evals for WebMCP](https://developer.chrome.com/docs/ai/webmcp/evals#run-probabilistic-tests)

## Running the evaluations

The current first-party CLI is the experimental `webmcp-evals` package. Its active README documents three useful modes: `local` for static schemas, `browser` for live model-driven evaluation through Puppeteer, and `smoke` for direct no-model execution against a live page. It supports Gemini, Ollama, and Vercel AI SDK backends, repeated runs, ordered/unordered trajectories, constraint matchers, and console/JSON/HTML reports. [GoogleChromeLabs WebMCP Evals README](https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/webmcp-evals/README.md)

Start the app:

```sh
npm run dev -- --host 127.0.0.1 --port 4173
```

Run deterministic live tool calls without an API key:

```sh
npx webmcp-evals smoke \
  --chrome-channel chrome \
  --url http://127.0.0.1:4173 \
  --evals evals/webmcp-evals.json \
  --verbose
```

Run model-backed browser evaluations repeatedly:

```sh
npx webmcp-evals browser \
  --chrome-channel chrome \
  --url http://127.0.0.1:4173 \
  --evals evals/webmcp-evals.json \
  --backend vercel \
  --model <model-id> \
  --runs 10 \
  --max-steps 8 \
  --reporter console json html
```

Set the provider key documented for the chosen backend. Reports default to `.evals/`. Because the CLI is experimental, pin its version in development dependencies rather than relying indefinitely on an unpinned `npx` download.

For local WebMCP, Chrome's current setup instructions require enabling `chrome://flags/#enable-webmcp-testing` and relaunching Chrome. The eval CLI defaults to Chrome Canary and allows selecting a Chrome channel. [Chrome: WebMCP local setup](https://developer.chrome.com/docs/ai/webmcp#get-started)

## Release gate

A practical initial gate is:

- Every deterministic test and `webmcp-evals smoke` case passes.
- Each direct model eval succeeds in at least 9 of 10 runs.
- Each paraphrased or ambiguous case succeeds in at least 8 of 10 runs.
- No negative-selection case invokes `edit_workflow`, `undo_workflow_edit`, or another mutating tool.
- Failures are reviewed in the generated JSON/HTML report and converted into durable regression prompts.

These thresholds are project policy, not values prescribed by Chrome. Increase run counts and tighten thresholds after collecting a stable baseline across the models the application is expected to support.

## Important caveat

The Chrome article's “experimental evaluation tools” link currently targets the former `evals-cli` directory and returns 404. The official repository has renamed that directory and CLI to `webmcp-evals`; use the current README linked above.
