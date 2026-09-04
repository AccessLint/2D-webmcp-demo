# 2D WebMCP Demo

The 2D WebMCP Demo is an accessible browser-based node editor for verifiable agent actions. Human interface controls and WebMCP tools operate on one authoritative workflow graph. Each successful transaction produces a deterministic, inspectable change receipt that can be revealed or undone.

Live application: <https://2d-webmcp.netlify.app/>

## Agent workflow

1. Call `discover_workflow` first unless the canvas is visibly empty and the task only creates new items; in that case, call `edit_workflow` directly and omit `baseRevision`.
2. Optionally call `inspect_workflow_items` for properties, relationships, or receipt changes.
3. For an existing canvas, copy the current revision and item IDs into one atomic `edit_workflow` request. Use the node-type ports documented by `edit_workflow`.
4. Use the returned `operationId` with `inspect_workflow_items`, `show_target`, or `undo_workflow_edit`.
5. If an edit conflicts or reports stale input, call `discover_workflow` again before retrying.

For page focus, call `show_target` with `kind: "page-element"` and a named ID such as `canvas.zoom-in`. Focus is queued until the browser receives keyboard, DOM-focus, or assistive-technology interaction.

## WebMCP tools

- `discover_workflow`: Return a compact page of workflow IDs and labels plus the current revision.
- `inspect_workflow_items`: Return details for nodes and connections or paginated changes for a receipt.
- `edit_workflow`: Apply a typed command batch atomically against an exact revision.
- `show_target`: Bring a workflow item, change receipt, or named page element into view and move or queue keyboard focus.
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
