import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite-plus';
import mdx from 'fumadocs-mdx/vite';
import { fileURLToPath } from 'node:url';
import { appBoundary } from '../../scripts/app-boundary';

export default defineConfig({
  server: { host: '0.0.0.0', port: 8020, strictPort: true },
  resolve: { tsconfigPaths: true },
  plugins: [
    appBoundary('site'),
    mdx(),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: 'vercel',
      output: { dir: fileURLToPath(new URL('../../.vercel/output', import.meta.url)) },
    }),
    react(),
  ],
});
