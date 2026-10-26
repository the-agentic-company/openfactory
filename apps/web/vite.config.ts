import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  server: { host: '0.0.0.0', port: 8018, strictPort: true },
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackStart(), nitro({ preset: 'node-server' }), react()],
});
