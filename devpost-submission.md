# Title

2D WebMCP — Verifiable Agent Actions for Blind Users

## One-line Summary

A WebMCP-powered workflow canvas that lets agents make complex 2D edits while giving blind users deterministic, screen-reader-accessible evidence they can inspect, reveal, and undo.

## Problem

Blind users increasingly rely on AI to understand and operate spatial interfaces such as diagrams, maps, boards, charts, and design canvases. The agent may complete the task, but independently verifying what changed can require retracing a complex interface, holding many relationships in working memory, asking a sighted person, or simply trusting the agent.

The users who benefit most from AI-mediated access often have the hardest time obtaining proof that the action was correct.

## Solution

This project demonstrates a proof-first interaction pattern for agent-authored changes in a 2D workflow editor. Human UI actions and eight WebMCP tools share one authoritative graph model. Each atomic edit produces an application-authored receipt describing the affected objects, revision, and undo capability. Separate tools can focus the receipt, reveal a workflow object, or queue focus for a named page control.

The result is a collaboration loop in which an agent handles spatial complexity while the user retains a fast, accessible path to verification and control.

## Why This Matters

WebMCP can do more than expose buttons to agents. It can create a trustworthy handoff between agent action and human review. This project makes that idea concrete for blind screen-reader users and offers a reusable pattern for diagram editors, slide tools, node graphs, mapping applications, and other spatial software.

This directly supports the hackathon's **WebMCP Leverage** criterion through a non-trivial eight-tool contract, **Execution** through a runnable accessible product, **Potential Impact** through a specific verification barrier, and **Creativity & Ambition** through application-authored proof and focus handoff.

## How We Used AI

- Tested natural-language tool selection and multi-step WebMCP journeys with `openai:gpt-5-mini` through Chrome's experimental `webmcp-evals` runner.
- Used probabilistic evaluations to measure discovery, inspection, editing, focus, and reveal behavior over repeated runs.
- Compared agent behavior with deterministic browser smoke tests so model failures could be distinguished from application/tool failures.
- Used the model traces to identify a concrete schema-usability gap: the complex editing contract was executable with valid inputs, but the model repeatedly invented unsupported command shapes.

## How We Used Codex

Codex helped inspect and refine the WebMCP boundary, create deterministic and probabilistic evaluation fixtures, exercise the live tools in Chrome, analyze failure trajectories, and turn the findings into reproducible testing and submission evidence. The process used the model not only to generate code, but to test assumptions about whether another agent could correctly understand and use the exposed tools.

## Key Features

- Eight native WebMCP tools for discovery, inspection, atomic editing, reveal, focus, evidence retrieval, evidence display, and undo.
- Revision preconditions and atomic command batches that prevent stale or partial graph edits.
- Deterministic, application-authored change receipts rather than agent-authored claims.
- Screen-reader announcements and verified focus transfer to receipts, workflow nodes, and named page controls.
- Keyboard-only reveal and undo workflow.
- Compact browser-facing responses with bounded pagination, structured recovery guidance, and privacy-limited invocation telemetry.
- Deterministic unit, integration, accessibility, and Playwright coverage.
- Repeated model-backed WebMCP evaluation cases and live-browser smoke tests.

## Architecture

- `src/graph`: workflow domain model, commands, references, and selectors.
- `src/state`: atomic transactions, revisions, receipts, UI state, and session persistence.
- `src/receipts`: deterministic evidence generation and accessible receipt DOM behavior.
- `src/webmcp`: schemas, bounded outputs, tool handlers, registration, browser actions, and focus handoff.
- `evals`: generic/surface baselines and natural-language WebMCP evaluation cases.
- `tests`: domain, tool-boundary, accessibility, and end-to-end verification.

## Testing Instructions

### Judge walkthrough

1. Open the public demo in Chrome with WebMCP enabled or ChatGPT's in-app browser.
2. Start from a fresh tab at workflow revision 0.
3. Ask: “We’ve had leads disappear whenever company enrichment is unavailable. Update the workflow so those leads are not lost and can be handled by the sales operations team. Show me what changed.”
4. Verify the application-authored receipt reads: “Changed 1 connection.”
5. Ask the agent to show where failed enrichment is handled, then to focus the Zoom In control.
6. Use only the keyboard to reveal and undo the change.

### Automated checks

```sh
npm install
npm test
npm run build
npm run test:e2e
```

### Evaluation evidence

- Deterministic live-browser smoke run: 9/9 required tool steps passed across 5 cases.
- Initial GPT-5 mini baseline: 5 cases × 10 runs, 0 execution errors, and a strict step-level match rate of 23.4%.
- The baseline is documented honestly in `docs/evals/hackathon-evidence.md`; it exposed excess calls and a complex-edit schema-usability failure that should be fixed and rerun before claiming probabilistic reliability.
- Raw local report: `.evals/report-1788212058992.html`.

## Public Demo Link

https://2d-webmcp.netlify.app/

## Public Repository Link

https://github.com/AccessLint/webmcp-proof

## Demo Video

https://www.youtube.com/watch?v=V1MT0lIVe-Y

TODO: Confirm the video is public, under three minutes, includes audio, and shows the live WebMCP interaction plus the accessible verification path.

## Screenshot Shot List

1. Initial workflow canvas with the seven named nodes.
2. Completed recovery edit with the new failure route visible.
3. Change History receipt showing the deterministic summary, reveal, and undo controls.
4. Keyboard focus visible on the Manual review node or Zoom In control.
5. Evaluation evidence page showing the deterministic 9/9 smoke result and the model-baseline methodology.

The existing `retry-node-proof.png` asset shows the retired flow model and should be replaced before submission.

## Submission Readiness Notes

- Devpost authentication and registration for **The WebMCP Challenge** were verified live on August 31, 2026.
- A live project is already published at https://devpost.com/software/screen-readers-webmcp and associated with the challenge.
- Official submission requirements include a working live URL, a public licensed repository, a text explanation of WebMCP fit and implementation, and a public demo video under three minutes with audio.
- The current raw eval report should not be published as a positive effectiveness headline without its interpretation. The complex edit failed in the model-backed run.
- The deterministic smoke result is strong implementation evidence; a corrected model-backed rerun is still required for a strong agent-reliability claim.

## Known Limitations

- WebMCP is experimental and requires a compatible browser configuration.
- The demo uses a focused workflow domain rather than a production backend.
- The initial GPT-5 mini run showed that the complex edit schema was difficult for the model to use correctly despite structured recovery responses.
- The HTML eval report is local and not yet available at a public URL.
- Assistive-technology behavior still benefits from manual verification with VoiceOver and NVDA in addition to automated accessibility checks.

## TODO Official Form Fields

- **Submitter Type (required):** TODO — choose Individual, Team of Individuals, or Organization.
- **Country of residence (required):** TODO.
- **Organization name (optional):** TODO if applicable.
- **App Status (required):** TODO — choose New or Existing.
- **Existing-project update explanation:** TODO if App Status is Existing.
- **Live URL (required):** `https://2d-webmcp.netlify.app/`
- **Judge-only testing instructions (optional):** Use the Judge walkthrough above; no credentials are currently documented.
- **Public repository URL (required):** `https://github.com/AccessLint/webmcp-proof`
- **Agents or clients tested (required):** Chrome WebMCP Evals with `openai:gpt-5-mini`; TODO add any ChatGPT in-app browser, Chrome agent, VoiceOver, or NVDA testing completed personally.
- **AI tools used (required):** Codex, OpenAI GPT-5 mini, Chrome WebMCP Evals; TODO confirm any others.
- **Learning level (required):** TODO — choose None, Moderate, or Significant.
- **Career AI value (required):** TODO — choose Yes or No.
