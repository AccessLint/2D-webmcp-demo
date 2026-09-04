# 2D WebMCP Demo

Agent-friendly, screen reader accessible flow diagram editor demonstrating human / agent collaboration with WebMCP. Try it out with the sample prompt at https://2d-webmcp.netlify.app/ in your ChatGPT desktop in-app browser.

## WebMCP tools

| Tool | Use it to |
| --- | --- |
| `discover_workflow` | Get a compact, paginated list of workflow item IDs and labels plus the current revision. Skip it only for a known empty-canvas create. |
| `inspect_workflow_items` | Read properties or relationships for workflow items, or paginated changes for an edit receipt, without changing the visible selection. |
| `edit_workflow` | Atomically apply up to 100 create, update, delete, connect, or disconnect commands. Layout and compact receipts are automatic. |
| `show_target` | Bring a workflow item, edit receipt, or named page element into view and move or queue keyboard focus when applicable. |
| `undo_workflow_edit` | Undo a successful edit while it is still the latest workflow revision and return the reversal result. |
