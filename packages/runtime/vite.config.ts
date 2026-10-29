import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  build: {
    target: 'node26',
    lib: {
      entry: resolve(import.meta.dirname, 'src/cli.ts'),
      formats: ['es'],
      fileName: () => 'runtime.mjs',
    },
    rolldownOptions: { external: [/^node:/] },
  },
});
