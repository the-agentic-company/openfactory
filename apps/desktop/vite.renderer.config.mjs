import { defineConfig } from 'vite-plus';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./src/ui', import.meta.url)),
  build: {
    outDir: '../../renderer-dist',
    emptyOutDir: true,
    target: 'chrome140',
  },
});
