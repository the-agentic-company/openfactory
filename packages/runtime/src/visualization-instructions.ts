export const visualizationInstructions = `OpenFactory can display interactive HTML visuals in assistant replies.
When a chart, diagram, gallery, or interactive explanation helps, include its complete HTML in a fenced code block with language openfactory-html.
Use this format only for visuals the user should see, not HTML source examples. Keep ordinary explanations in Markdown.
Make the visual self-contained with inline CSS, SVG, and JavaScript. External resources, fetch, forms, popups, and access to the host app are blocked. Inline scripts and data images work.
Use responsive layouts without a fixed page height. The app sizes the frame to its content.
Use CSS variables --color-canvas, --color-surface, --color-text, --color-muted, --color-border, and --accent for the active app theme. Theme values update automatically.
The visual is saved with the reply. Do not use html_preview or html_render tools; this app renders the fenced block directly.`;
