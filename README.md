# 2D WebMCP Demo

A browser-based node editor demonstrating verifiable agent actions. Human UI controls and WebMCP tools share one authoritative graph model; every committed transaction produces a deterministic, inspectable change receipt.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL. In a WebMCP-enabled Chrome build, the page registers eight native tools through `document.modelContext`; a connected agent can edit the workflow and the page presents the resulting receipt for human review.

For a three-minute feature tour—including keyboard-only, VoiceOver, and NVDA checks—see the [judge smoke test](docs/TESTING.md).

## Verify

```sh
npm test
npm run build
npm run test:e2e
```

The tests cover atomic graph commands, revision conflicts, validation, receipt accuracy, undo round trips, WebMCP handlers, and the accessible review path.

## Code structure

- `src/graph` owns the workflow model, commands, references, selectors, and validation.
- `src/state` coordinates workflow transactions, receipts, UI state, and session persistence.
- `src/receipts` turns committed workflow differences into verifiable change records.
- `src/webmcp` defines schemas, handlers, browser actions, and native tool registration.
- `src/components` renders the canvas, live announcements, and change history.

The graph command executor is the main write interface. It clones the current workflow, applies the complete command batch, validates the result, and only then returns a new revision. The store records that result as a receipt and keeps browser persistence behind a separate module.

## WebMCP tools

| Tool | Use it to |
| --- | --- |
| `discover_workflow` | Start here. Get a compact, paginated list of item IDs plus the current revision, valid ports, named page targets, and next steps. |
| `inspect_workflow_items` | Read compact summaries, properties, or paginated relationships for specific nodes or connections. |
| `edit_workflow` | Apply one atomic set of typed workflow commands using the latest revision. |
| `show_workflow_item` | Select a node or connection and bring it into view. Nodes also receive keyboard focus. |
| `focus_page_element` | Queue focus for a named page target, or use a CSS selector as an advanced fallback. |
| `get_edit_result` | Retrieve paginated changes and validation problems for an edit operation. |
| `show_edit_result` | Bring an edit result into view and move keyboard focus to it. |
| `undo_workflow_edit` | Undo an edit while it is still the latest workflow revision. |

Agents should call `discover_workflow` first. Its browser-facing response stays within a 1,500-character budget and includes the current revision, valid node types and ports, named UI targets, paginated validation problems, and a page of stable item IDs. Pass each `nextCursor` back through the corresponding cursor field to continue. `edit_workflow` uses the discovered revision without incrementing it to prevent stale edits and returns compact evidence; use `get_edit_result` to page through every change or validation problem. Node labels may be supplied either as strings or as label objects copied from a `SurfaceSnapshot` adapter.

The direct handler and external eval adapter retain a `surfaceSnapshot` conforming to the draft 2D WebMCP `SurfaceSnapshot` proposal. Native browser registration compacts that result to meet the tool-output budget. The app vendors the draft JSON Schema in `src/webmcp/schemas` as a conformance fixture; it is not an npm dependency or a claim of a finalized standard.

The external eval bridge also exposes a minimal generic editor baseline for comparison. Its discovery result contains only `revision`, flat `items`, and flat `relationships`; its successful edit result is `{status, changed: [{id, action}]}`. This is an eval adapter, not an additional browser-facing tool contract.

1. Call `discover_workflow`.
2. Optionally call `inspect_workflow_items` for more detail.
3. Copy the returned revision into `edit_workflow` and submit the intended commands.
4. Use the returned `operationId` with `get_edit_result`, `show_edit_result`, or `undo_workflow_edit`.

If an edit conflicts or a tool reports stale input, follow its recovery instruction and call `discover_workflow` again.

For page focus, prefer a named `targetId` such as `canvas.zoom-in`. A CSS `selector` remains available as an advanced fallback. Focus is queued until the browser receives a keyboard, DOM-focus, or assistive-technology interaction, rather than being repeatedly forced afterward.

The registered JSON Schemas are generated from the same definitions used to validate tool inputs at runtime. IDs, labels, ports, property names and values, operation IDs, and property counts have explicit limits. Invalid input and missing items return structured error codes, field-level issues, and context-specific recovery guidance.

Tools returning workflow or receipt content are marked with `untrustedContentHint`. Browser-facing outputs are compacted to at most 1,500 characters, while application-authored receipts remain complete in the UI. Registration is transactional through the returned `ready` promise, and abort signals cancel pending UI work. The session keeps the latest 100 privacy-limited invocation records—tool name, parameter names, outcome/code, latency, revisions, and operation ID—without storing parameter values. Each record is also emitted as a `webmcp:invocation` window event so production telemetry can consume the safe event without coupling analytics to the tool handlers.
