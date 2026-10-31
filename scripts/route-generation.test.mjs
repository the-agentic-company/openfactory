import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

// Exercise the generator used by Start, including the installed pnpm patch.
const web = createRequire(new URL('../apps/app/package.json', import.meta.url));
const start = createRequire(web.resolve('@tanstack/react-start/package.json'));
const core = createRequire(start.resolve('@tanstack/start-plugin-core/package.json'));
const router = createRequire(core.resolve('@tanstack/router-plugin/package.json'));
const { Generator, getConfig } = await import(
  new URL(
    'dist/esm/index.js',
    pathToFileURL(router.resolve('@tanstack/router-generator/package.json')),
  )
);

for (const file of ['index.tsx', '__root.tsx']) {
  test(`an empty ${file} during a save cannot be replaced by starter content`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'openfactory-routes-'));
    try {
      const routes = join(root, 'src/routes');
      await mkdir(routes, { recursive: true });
      await writeFile(
        join(routes, '__root.tsx'),
        "import { createRootRoute, Outlet } from '@tanstack/react-router';\nexport const Route = createRootRoute({ component: Outlet });\n",
      );
      await writeFile(
        join(routes, 'index.tsx'),
        "import { createFileRoute } from '@tanstack/react-router';\nexport const Route = createFileRoute('/')({ component: Dashboard });\nfunction Dashboard() { return <main>Actual workspace</main>; }\n",
      );
      const generator = new Generator({
        root,
        config: getConfig({ disableLogging: true }, root),
      });
      await generator.run();
      const route = join(routes, file);
      const saved = await readFile(route, 'utf8');
      const tree = await readFile(join(root, 'src/routeTree.gen.ts'), 'utf8');
      await writeFile(route, '');
      await assert.rejects(generator.run({ type: 'update', path: route }), /empty route file/i);
      assert.equal(await readFile(route, 'utf8'), '');
      assert.equal(await readFile(join(root, 'src/routeTree.gen.ts'), 'utf8'), tree);
      await writeFile(route, saved);
      await generator.run({ type: 'update', path: route });
      assert.equal(await readFile(route, 'utf8'), saved);
      assert.match(await readFile(join(routes, 'index.tsx'), 'utf8'), /Actual workspace/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
