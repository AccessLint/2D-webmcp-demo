# Prove it with WebMCP

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
| `discover_workflow` | Start here. Get the current revision, valid item IDs and ports, named page targets, validation state, and example calls. |
| `inspect_workflow_items` | Read full details and relationships for specific nodes or connections. |
| `edit_workflow` | Apply one atomic set of typed workflow commands using the latest revision. |
| `show_workflow_item` | Select a node or connection and bring it into view. Nodes also receive keyboard focus. |
| `focus_page_element` | Queue focus for a named page target, or use a CSS selector as an advanced fallback. |
| `get_edit_result` | Retrieve the application-authored result for an edit operation. |
| `show_edit_result` | Bring an edit result into view and move keyboard focus to it. |
| `undo_workflow_edit` | Undo an edit while it is still the latest workflow revision. |

Agents should call `discover_workflow` first. Its response includes the current revision, valid node IDs and ports, named UI targets, and copyable examples for the next tool call. `edit_workflow` uses that revision to prevent stale edits and returns a receipt that can be inspected, focused, or undone.

1. Call `discover_workflow`.
2. Optionally call `inspect_workflow_items` for more detail.
3. Copy the returned revision into `edit_workflow` and submit the intended commands.
4. Use the returned `operationId` with `get_edit_result`, `show_edit_result`, or `undo_workflow_edit`.

If an edit conflicts or a tool reports stale input, follow its recovery instruction and call `discover_workflow` again.

For page focus, prefer a named `targetId` such as `canvas.zoom-in`. A CSS `selector` remains available as an advanced fallback. Focus is queued until the browser receives a keyboard, DOM-focus, or assistive-technology interaction, rather than being repeatedly forced afterward.

The registered JSON Schemas are generated from the same definitions used to validate tool inputs at runtime. Invalid input and missing items return structured error codes, field-level issues, and a recovery call back to `discover_workflow`.
