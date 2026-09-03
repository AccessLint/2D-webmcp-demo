# 2D WebMCP Demo

The 2D WebMCP Demo is an accessible browser-based node editor for verifiable agent actions. Human interface controls and WebMCP tools operate on one authoritative workflow graph. Each successful transaction produces a deterministic, inspectable change receipt that can be revealed or undone.

Live application: <https://2d-webmcp.netlify.app/>

## Agent workflow

1. Call `discover_workflow` first.
2. Optionally call `inspect_workflow_items` for full details about selected nodes or connections.
3. Copy the current revision, valid item IDs, and valid ports from discovery into one atomic `edit_workflow` request.
4. Use the returned `operationId` with `get_edit_result`, `show_edit_result`, or `undo_workflow_edit`.
5. If an edit conflicts or reports stale input, call `discover_workflow` again before retrying.

For page focus, prefer a named `targetId`, such as `canvas.zoom-in`. CSS selectors are an advanced fallback. Focus requests are queued until the browser receives keyboard, DOM-focus, or assistive-technology interaction.

## WebMCP tools

- `discover_workflow`: Return the revision, valid IDs and ports, named page targets, a draft `SurfaceSnapshot`, and example calls.
- `inspect_workflow_items`: Return full details and relationships for specified nodes or connections.
- `edit_workflow`: Apply a typed command batch atomically against an exact revision.
- `show_workflow_item`: Select a node or connection and bring it into view; nodes also receive keyboard focus.
- `focus_page_element`: Queue focus for a named page target or, as a fallback, a CSS selector.
- `get_edit_result`: Retrieve the application-authored receipt for an edit operation.
- `show_edit_result`: Bring a receipt into view and move keyboard focus to it.
- `undo_workflow_edit`: Undo an edit only while it remains the latest workflow revision.

## Architecture

- `src/graph` owns the workflow model, commands, references, and selectors.
- `src/state` coordinates transactions, receipts, interface state, and session persistence.
- `src/receipts` converts committed workflow differences into verifiable change records.
- `src/webmcp` defines schemas, handlers, browser actions, and native tool registration.
- `src/components` renders the canvas, live announcements, and change history.

The graph command executor clones the current workflow, applies the complete command batch atomically, and then returns a new revision. The store records that result as a receipt and isolates browser persistence in a separate module.

## Verification

Run `npm test`, `npm run build`, and `npm run test:e2e`. The suites cover atomic graph commands, revision conflicts, receipt accuracy, undo round trips, WebMCP handlers, accessibility, and keyboard interaction.

The app vendors draft `SurfaceSnapshot` and `SurfaceReceipt` JSON Schemas as conformance fixtures. They are not npm dependencies or claims of finalized standards.

## More information

- [Judge smoke test](https://raw.githubusercontent.com/AccessLint/webmcp-proof/main/docs/TESTING.md)
- [Source repository](https://github.com/AccessLint/webmcp-proof)
- [LLM navigation file](https://2d-webmcp.netlify.app/llms.txt)
