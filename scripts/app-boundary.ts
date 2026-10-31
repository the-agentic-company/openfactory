import type { Plugin } from 'vite-plus';

export function appBoundary(app: 'app' | 'site'): Plugin {
  const forbidden =
    app === 'site'
      ? /\/(?:apps\/(?:app|desktop)\/src\/|packages\/(?:runtime|db)\/)/
      : /\/(?:apps\/site\/|fumadocs-[^/]+\/)/;
  return {
    name: `${app}-boundary`,
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') {
          continue;
        }
        for (const [id, module] of Object.entries(output.modules)) {
          if (module.renderedLength > 0 && forbidden.test(id)) {
            this.error(`${app} must not bundle code from ${id}`);
          }
        }
      }
    },
  };
}
