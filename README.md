# 2D WebMCP Demo

Agent-friendly, screen reader accessible flow diagram editor demonstrating human / agent collaboration with WebMCP. Try it out with the sample prompt at https://2d-webmcp.netlify.app/ in your ChatGPT desktop in-app browser.

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
