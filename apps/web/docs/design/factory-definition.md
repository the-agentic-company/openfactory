# Factory definition

Baptiste uses this page to find and edit the YAML and Markdown for a factory. The supplied Warp screenshot fixes the composition inside the existing OpenFactory workspace.

## Direction contract

THESIS: Keep the saved file tree beside the editor for inspection without leaving the workspace.

OWN-WORLD: Inherit OpenFactory's dark neutral backgrounds, orange selection, system UI text, and existing controls. Reserve monospace for paths and code.

STORY: Select a factory, choose a file, inspect or change its source, then save. Distinguish stored configuration from live agent updates.

FIRST VIEWPORT: A heading and save action above a compact notice. A 260px file tree sits beside the syntax-highlighted editor, line numbers, and file tab. On mobile the file picker moves above the editor.

FORM: User-supplied Warp file-tree/editor composition. seed: not applicable (user-supplied reference).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Runtime constraints

Native files persist on the OpenFactory host in versioned snapshots. factory.yaml is stored configuration. Agent saves target existing T3 tasks and preserve schedules and runtime options. Branch selection and automation provisioning are outside this page's current capabilities.

## Shipped design comparison

The desktop build keeps the existing workspace navigation and orange selection beside the file tree and editor. Breadcrumbs identify the page above the notice. Reload and Save file sit between the notice and editor. The file tree grows to 260px, while the editor uses 13px monospace text and readable line numbers. At widths of 740px or less, native Factory and File selectors replace the sidebar and tree.

The desktop and mobile captures in `.impeccable/review/factory-definition/` record the implemented composition. They are review evidence, not shipping image assets. The gutter contrast fix uses `#8c91a0`. The supplied reference requires no generated seed or raster asset.

This ordinary extension preserves the existing system defined in `src/styles.css`. The finish requirement above does not authorize a new global `DESIGN.md` or sidecar. These notes document the page without promoting its editor-specific colors and layout into global rules.
