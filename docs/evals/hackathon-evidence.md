# WebMCP evaluation evidence

## What was evaluated

The live application exposed eight WebMCP tools to Chrome. The evaluation suite covered five representative journeys:

1. Discover the workflow.
2. Inspect the relationships around **Enrich company**.
3. Complete a complex branch edit using a node type that has since been retired, then surface the edit evidence.
4. Move keyboard focus to the named **Zoom In** target.
5. Reveal the **Enrich company** node on the canvas.

The model-backed run used `openai:gpt-5-mini`, the Vercel backend, stable Chrome, and 10 runs per case. It predates the simplified Node, Action, and Condition model; the active `evals/webmcp-evals.json` fixture now uses an outcome-oriented recovery request and has not yet been rerun.

## Results currently available

### Deterministic browser smoke test

- 5 cases
- 9 required tool steps
- 9/9 steps completed successfully
- Tools were discovered and executed through the live browser page

This establishes that the registered WebMCP tools, their handlers, and their browser-visible side effects work when called with valid arguments.

### Model-backed browser baseline

- 5 cases × 10 runs
- 261 recorded tool-call comparisons
- 61 matched, 200 did not match, 0 execution errors
- Strict step-level match rate: 23.4%

Per-case report totals:

| Journey | Matched report steps |
| --- | ---: |
| Discover the workflow | 10/37 |
| Inspect Enrich company relationships | 13/21 |
| Legacy complex branch edit | 10/152 |
| Focus Zoom In | 10/28 |
| Reveal Enrich company | 18/23 |

The raw HTML report is currently local at `.evals/report-1788212058992.html`.

## Interpretation

The aggregate 23.4% figure should not be presented as an end-to-end task success rate. The report uses strict trajectory matching and counts every extra call as a failure. Some extra calls were reasonable inspections or repeated focus calls. Looking at complete trajectories gives a more useful picture:

- The inspect journey followed the intended `discover_workflow → inspect_workflow_items` chain in 9 of 10 runs.
- The reveal journey followed the intended `discover_workflow → show_workflow_item` chain in 7 of 10 runs.
- The legacy complex edit did not complete successfully. The model repeatedly generated unsupported command shapes and received structured `INVALID_INPUT` responses. One run created the node but failed to complete its connections.

This baseline therefore demonstrates two things: the live tools execute reliably with valid inputs, and the current tool contract still needs improvement before a small model can reliably author the complex edit.

## Before using this as hackathon performance evidence

1. Update the eval expectations to allow defensible optional inspection without accepting arbitrary extra calls.
2. Make the edit schema and error feedback teach the exact command vocabulary more directly.
3. Rerun the same 5 × 10 matrix with the same model and settings.
4. Publish both the new report and this baseline so the improvement is reproducible rather than cherry-picked.
5. Report case-level journey success alongside strict step-level matching.

The strongest current hackathon claim is: **all 9 deterministic live-browser tool steps passed, while the first probabilistic model baseline exposed a concrete schema-usability gap in the most complex editing journey.**
