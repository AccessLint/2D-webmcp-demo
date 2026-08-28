# Workflow Evidence Lab

A browser-based node editor demonstrating verifiable agent actions. Human UI controls and WebMCP tools share one authoritative graph model; every committed transaction produces a deterministic, inspectable change receipt.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL and choose **Run Retry demo**. The fallback panel works in every browser. In a WebMCP-enabled Chrome build, the page also registers six native tools through `document.modelContext`.

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
- `get_change_receipt`
- `undo_workflow_change`

The adapter contains no graph business logic. Unsupported browsers use the visible development panel to invoke the same handlers.
