# 2D WebMCP Demo

Agent-friendly, screen reader accessible flow diagram editor demonstrating human / agent collaboration with WebMCP. Try it out with the sample prompt at https://2d-webmcp.netlify.app/ in your ChatGPT desktop in-app browser.

## WebMCP tools

| Tool | Use it to |
| --- | --- |
| `discover_workflow` | Start here once per task. Get a compact, paginated list of item IDs with labels for nodes, plus the current revision, valid ports, named page targets, validation problems, and next steps. |
| `inspect_workflow_items` | After discovery, read compact summaries, properties, or paginated relationships for specific nodes or connections without changing the visible selection. |
| `edit_workflow` | After discovery, atomically apply up to 20 typed workflow commands using its exact revision. |
| `show_workflow_item` | Select a node or connection and bring it into view. Nodes also receive keyboard focus. |
| `focus_page_element` | After discovery, queue keyboard focus for one named page target ID returned by it. |
| `get_edit_result` | Retrieve paginated changes and validation problems for an operation returned by an edit or undo. |
| `show_edit_result` | Bring an edit or undo result into view and move keyboard focus to it as visible proof. |
| `undo_workflow_edit` | Undo a successful edit while it is still the latest workflow revision and return the reversal result. |
