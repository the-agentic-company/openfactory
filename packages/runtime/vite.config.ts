import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  build: {
    target: 'node26',
    lib: {
      entry: {
        runtime: resolve(import.meta.dirname, 'src/cli.ts'),
        client: resolve(import.meta.dirname, 'src/client.ts'),
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.mjs`,
    },
    rolldownOptions: { external: [/^node:/] },
  },
});
