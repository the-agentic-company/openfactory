import { defineConfig } from 'vite-plus';

export default defineConfig({ test: { include: ['test/**/*.test.mjs'], testTimeout: 20000 } });
