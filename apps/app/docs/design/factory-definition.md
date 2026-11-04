# Factory definition

Baptiste uses this page to find and edit the YAML and Markdown for a factory. The supplied Warp screenshot fixes the composition inside the existing OpenFactory workspace.

## Direction contract

THESIS: Keep the saved file tree beside the editor for inspection without leaving the workspace.

OWN-WORLD: Inherit OpenFactory's warm neutral backgrounds, terracotta selection, system UI text, and existing controls. Reserve monospace for paths and code.

STORY: Select a factory, choose a file, inspect or change its source, then save. Distinguish stored configuration from live agent updates.

FIRST VIEWPORT: A heading and save action above a compact notice. A 248px file tree sits beside the syntax-highlighted editor, line numbers, and file path. On mobile the file picker moves above the editor.

FORM: User-supplied Warp file-tree/editor composition. seed: not applicable (user-supplied reference).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Runtime constraints

Native files live in `factory/` inside each repository on the selected runtime host. The runtime loads definitions from those files, including external edits, and keeps content revisions to reject stale saves. Agent IDs in frontmatter preserve history across renames and restarts. UI saves write repository changes for the user to review and commit. The runtime stores conversations, credentials, and scheduler state separately.

## Shipped design comparison

The file explorer and editor share one bordered frame. The explorer uses the warm canvas color, a Files heading and file count, a search field, and nesting guides. A directory containing only `agent.md` appears as one file row with the agent directory name above the filename. The full path remains available in the tooltip and accessible name. Selected files use the shared accent background, while unsaved files have a dot and a footer count.

The editor header shows the parent path and filename with an inline unsaved state. Undo, redo, find, and line wrapping sit in a quiet toolbar. The language and cursor position appear in the bottom status bar. The tree is 248px wide on larger screens and 220px at intermediate widths. At 740px or less, Factory and File selectors replace the tree, and the editor keeps a usable scrolling area.

The refinement was checked with the actual page component and temporary sample definitions at 1440px, 900px, 760px, and 390px. Checks covered selecting files, retaining drafts, enabling save after a valid edit, search with no results, and horizontal containment. Review captures are local verification artifacts, not shipping assets.

This ordinary extension preserves the existing system defined in `src/styles.css`. The finish requirement above does not authorize a new global `DESIGN.md` or sidecar. These notes document the page without promoting its editor-specific colors and layout into global rules.
