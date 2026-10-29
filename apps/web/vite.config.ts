import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig, type Plugin } from 'vite-plus';
import mdx from 'fumadocs-mdx/vite';
import { fileURLToPath } from 'node:url';

const publicSiteBoundary = {
  name: 'public-site-boundary',
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk') {
        continue;
      }
      for (const [id, module] of Object.entries(output.modules)) {
        if (
          module.renderedLength > 0 &&
          /\/(?:packages\/(?:runtime|db)\/|src\/routes\/(?:app|api\.|downloads\.)|src\/components\/desktop-chrome|src\/server\/(?!docs\.))/.test(
            id,
          )
        ) {
          this.error(`The public site must not ship workspace code: ${id}`);
        }
      }
    }
  },
} satisfies Plugin;

export default defineConfig(({ mode }) => {
  const publicSite = mode === 'public';
  return {
    server: {
      host: '0.0.0.0',
      port: 8018,
      strictPort: true,
      watch: { awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 } },
      allowedHosts: ['dell-server.taild717d7.ts.net'],
    },
    resolve: {
      tsconfigPaths: true,
      alias: publicSite
        ? {
            '../styles.css?url': `${fileURLToPath(new URL('./src/base.css', import.meta.url))}?url`,
            './routeTree.gen': fileURLToPath(
              new URL('./.tanstack/public-routeTree.gen.ts', import.meta.url),
            ),
          }
        : undefined,
    },
    define: { 'import.meta.env.PUBLIC_SITE': JSON.stringify(publicSite) },
    plugins: [
      ...(publicSite ? [publicSiteBoundary] : []),
      mdx(),
      tailwindcss(),
      tanstackStart(
        publicSite
          ? {
              router: {
                routeFileIgnorePattern: '^(app|api\\.|downloads\\.)',
                generatedRouteTree: '../.tanstack/public-routeTree.gen.ts',
              },
            }
          : {},
      ),
      nitro({
        preset: publicSite ? 'vercel' : 'node-server',
        ...(publicSite
          ? { output: { dir: fileURLToPath(new URL('../../.vercel/output', import.meta.url)) } }
          : process.env.OPENFACTORY_WEB_OUTPUT_DIR
            ? { output: { dir: process.env.OPENFACTORY_WEB_OUTPUT_DIR } }
            : {}),
      }),
      react(),
    ],
  };
});
