import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const sourceRoot = new URL('../apps/web/src/', import.meta.url);
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
        return entry.isDirectory() ? files(path) : [path];
      }),
    )
  ).flat();
}

await test('workspace pages cannot recreate their own main or breadcrumb toolbar', async () => {
  for (const file of await files(sourceRoot)) {
    if (
      !file.pathname.endsWith('.tsx') ||
      file.pathname.endsWith('/workspace-page.tsx') ||
      /\/(?:routes\/(?:index|download)|components\/marketplace)\.tsx$/.test(file.pathname)
    ) {
      continue;
    }
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /<main(?:\s|>)/,
      `${file.pathname}: use WorkspacePage to own the main and its spacing`,
    );
    assert.doesNotMatch(
      source,
      /(?:workspace-toolbar|factory-breadcrumb|workspace-page-header|workspace-page-breadcrumb)/,
      `${file.pathname}: pass title/actions to WorkspacePage`,
    );
  }
});

await test('only the shared stylesheet can style the page header and breadcrumb', async () => {
  for (const file of await files(sourceRoot)) {
    if (!file.pathname.endsWith('.css') || file.pathname.endsWith('/workspace-page.css')) {
      continue;
    }
    assert.doesNotMatch(
      await readFile(file, 'utf8'),
      /workspace-page(?:-header|-breadcrumb|--fill)|workspace-toolbar|factory-breadcrumb|single-run-breadcrumb/,
      `${file.pathname}: keep page geometry in workspace-page.css`,
    );
  }
});
