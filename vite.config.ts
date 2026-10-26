import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    ignorePatterns: ['**/routeTree.gen.ts', 'pnpm-lock.yaml', '.agents/**'],
  },
  lint: {
    plugins: ['typescript', 'react', 'jsx-a11y', 'import'],
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ['**/routeTree.gen.ts', '**/.output/**', '**/.tanstack/**', '.agents/**'],
    rules: { curly: 'error', 'react/react-in-jsx-scope': 'off' },
  },
  test: { include: ['packages/**/*.test.ts'] },
  run: { cache: true },
});
