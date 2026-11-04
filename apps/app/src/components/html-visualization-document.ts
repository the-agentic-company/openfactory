export const visualizationLimit = 1_000_000;
export const visualizationThemeProperties = [
  '--color-canvas',
  '--color-surface',
  '--color-inset',
  '--color-text',
  '--color-muted',
  '--color-border',
  '--accent',
] as const;

export function visualizationDocument(html: string) {
  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>
  :root { color-scheme: light; --color-canvas:#faf9f7; --color-surface:#fff; --color-text:#292622; --color-muted:#6f6860; --color-border:#dedad4; --accent:#e27022; color:var(--color-text); background:var(--color-canvas); font:14px/1.5 system-ui,sans-serif; }
  * { box-sizing:border-box } body { margin:0; padding:16px; overflow-wrap:anywhere } img,svg,canvas { max-width:100% }
  </style><script>
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'openfactory-theme') return;
    for (const [key, value] of Object.entries(event.data.properties)) {
      if (${JSON.stringify(visualizationThemeProperties)}.includes(key) && typeof value === 'string') document.documentElement.style.setProperty(key, value);
    }
    document.documentElement.style.colorScheme = event.data.colorScheme === 'dark' ? 'dark' : 'light';
  });
  addEventListener('DOMContentLoaded', () => {
    let previous = 0;
    const measure = () => {
      const height = Math.ceil(Math.max(document.body.scrollHeight, document.body.getBoundingClientRect().height));
      if (height !== previous) { previous = height; parent.postMessage({type:'openfactory-height', height}, '*'); }
    };
    new ResizeObserver(measure).observe(document.body);
    measure();
    parent.postMessage({type:'openfactory-ready'}, '*');
  });
  </script></head><body>${html}</body></html>`;
}
