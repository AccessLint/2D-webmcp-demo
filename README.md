# Prove it with WebMCP

A browser-based node editor demonstrating verifiable agent actions. Human UI controls and WebMCP tools share one authoritative graph model; every committed transaction produces a deterministic, inspectable change receipt.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL and choose **Run Retry demo**. The fallback panel works in every browser. In a WebMCP-enabled Chrome build, the page also registers eight native tools through `document.modelContext`.

## Verify

```sh
npm test
npm run build
npm run test:e2e
```

The tests cover atomic graph commands, revision conflicts, validation, receipt accuracy, undo round trips, WebMCP handlers, and the accessible review path.

## WebMCP tools

- `get_workflow_summary`
- `inspect_workflow_objects`
- `apply_workflow_changes`
- `reveal_workflow_object`
- `focus_dom_node`
- `get_change_receipt`
- `focus_change_entry`
- `undo_workflow_change`

Agents should call `get_workflow_summary` first. Its response includes the current revision, valid node IDs and ports, named UI targets, and copyable examples for the next tool call. `apply_workflow_changes` uses that revision to prevent stale edits and returns a receipt that can be inspected, focused, or undone.

For focus, prefer a named `targetId` such as `canvas.zoom-in`. A CSS `selector` remains available as an advanced fallback. Focus is queued until the browser receives a keyboard, DOM-focus, or assistive-technology interaction, rather than being repeatedly forced afterward.

The registered JSON Schemas are generated from the same definitions used to validate tool inputs at runtime. Invalid input and missing objects return structured error codes, field-level issues, and a recovery call back to `get_workflow_summary`.
