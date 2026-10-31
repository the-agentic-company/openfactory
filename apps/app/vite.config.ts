import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite-plus';
import { appBoundary } from '../../scripts/app-boundary';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 8018,
    strictPort: true,
    watch: { awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 } },
    allowedHosts: ['dell-server.taild717d7.ts.net'],
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    appBoundary('app'),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: 'node-server',
      ...(process.env.OPENFACTORY_APP_OUTPUT_DIR
        ? { output: { dir: process.env.OPENFACTORY_APP_OUTPUT_DIR } }
        : {}),
    }),
    react(),
  ],
});
