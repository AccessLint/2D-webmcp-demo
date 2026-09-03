# 2D WebMCP Demo

Agent-friendly, screen reader accessible flow diagram editor demonstrating human / agent collaboration with WebMCP. Try it out with the sample prompt at https://2d-webmcp.netlify.app/ in your ChatGPT desktop in-app browser.

## WebMCP tools

| Tool | Use it to |
| --- | --- |
| `discover_workflow` | Start here once per task unless the canvas is visibly empty and the task only creates items. Get a compact, paginated list of item IDs with labels for nodes, plus the current revision, valid ports, named page targets, and next steps. |
| `inspect_workflow_items` | After discovery, read compact summaries, properties, or paginated relationships for specific nodes or connections without changing the visible selection. |
| `edit_workflow` | After discovery—or directly with no revision on a visibly empty canvas—atomically apply up to 20 typed workflow commands, clean up the completed workflow layout, and reveal the resulting receipt. |
| `show_workflow_item` | Select a node or connection and bring it into view. Nodes also receive keyboard focus. |
| `focus_page_element` | After discovery, queue keyboard focus for one named page target ID returned by it. |
| `get_edit_result` | Retrieve paginated changes for an operation returned by an edit or undo. |
| `show_edit_result` | Revisit an edit result, reveal an undo result, or retry proof when an edit could not reveal its receipt. |
| `undo_workflow_edit` | Undo a successful edit while it is still the latest workflow revision and return the reversal result. |
