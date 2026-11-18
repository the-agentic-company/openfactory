import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  build: {
    target: 'node26',
    lib: {
      entry: { channels: resolve(import.meta.dirname, 'src/cli.ts') },
      formats: ['es'],
      fileName: (_format, name) => `${name}.mjs`,
    },
    rolldownOptions: { external: [/^node:/, /^@slack\//, /^chat$/, /^@chat-adapter\//] },
  },
});
