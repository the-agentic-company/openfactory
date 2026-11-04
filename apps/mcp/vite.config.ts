import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  build: {
    target: 'node26',
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'mcp.mjs',
    },
    rolldownOptions: { external: [/^node:/, /^mcp-use(\/|$)/] },
  },
});
