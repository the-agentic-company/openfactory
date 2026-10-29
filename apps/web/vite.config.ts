import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite-plus';
import mdx from 'fumadocs-mdx/vite';
import { fileURLToPath } from 'node:url';

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
            './routeTree.gen': fileURLToPath(
              new URL('./.tanstack/public-routeTree.gen.ts', import.meta.url),
            ),
          }
        : undefined,
    },
    define: { 'import.meta.env.PUBLIC_SITE': JSON.stringify(publicSite) },
    plugins: [
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
        ...(process.env.OPENFACTORY_WEB_OUTPUT_DIR
          ? { output: { dir: process.env.OPENFACTORY_WEB_OUTPUT_DIR } }
          : {}),
      }),
      react(),
    ],
  };
});
