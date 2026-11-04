import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { runtimeRpc } from '../apps/desktop/runtime/client.mjs';

const id = 'openfactory-task-board';
const prefix = `Database viewer check ${Date.now()} `;
const origin = process.env.OPENFACTORY_APP_URL ?? 'http://localhost:8018';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : existsSync(chrome)
      ? { executablePath: chrome }
      : {}),
});
async function sql(statement, args) {
  return runtimeRpc('apps.query', { id, statements: [{ sql: statement, args }] });
}
try {
  await sql(
    'INSERT INTO tasks(title) WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<55) SELECT ? || i FROM n',
    [prefix],
  );
  const catalog = await runtimeRpc('database.tables', { id });
  assert.ok(catalog.tables.some((table) => table.name === 'tasks'));
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/app/projects/openfactory/agents/task-board/database`);
  const viewer = page.getByRole('region', { name: 'Agent database', exact: true });
  await viewer.getByRole('button', { name: 'tasks', exact: true }).click();
  const grid = viewer.getByRole('region', { name: 'tasks rows', exact: true });
  await grid.getByRole('table').waitFor();
  assert.equal(await grid.getByRole('row').count(), 51, '50 data rows and a header');
  assert.equal(
    await grid.locator('input,textarea,[contenteditable=true]').count(),
    0,
    'No editing controls',
  );
  await viewer.getByRole('button', { name: 'Next page', exact: true }).click();
  await grid.getByRole('cell', { name: `${prefix}55`, exact: true }).waitFor();
  await viewer.getByRole('button', { name: 'Previous page', exact: true }).click();
  await grid.getByRole('cell', { name: `${prefix}1`, exact: true }).waitFor();
  await grid.getByRole('button', { name: 'Sort by title', exact: true }).click();
  await grid.locator('th[aria-sort=ascending]').waitFor();
  await viewer.getByRole('textbox', { name: 'Search tables' }).fill('activity');
  assert.equal(await viewer.getByRole('button', { name: 'tasks', exact: true }).count(), 0);
  await viewer.getByRole('button', { name: 'activity', exact: true }).click();
  await viewer
    .getByRole('region', { name: 'activity rows', exact: true })
    .getByRole('table')
    .waitFor();
  await viewer.getByRole('textbox', { name: 'Search tables' }).fill('');
  await viewer.getByRole('button', { name: 'tasks', exact: true }).click();
  await grid.getByRole('table').waitFor();
  await viewer.getByRole('button', { name: 'Refresh', exact: true }).click();
  await grid.getByRole('cell', { name: `${prefix}1`, exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/openfactory-database-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await viewer.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  assert.equal(
    await viewer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    true,
    'Viewer fits narrow screens',
  );
  await page.screenshot({ path: '/tmp/openfactory-database-mobile.png', fullPage: true });
  assert.deepEqual(errors, [], 'No browser errors');
  console.log(
    'PASS: table discovery, read-only grid, server pagination, sorting, table search, table switching, refresh and narrow layout.',
  );
} finally {
  try {
    await sql('DELETE FROM tasks WHERE substr(title,1,length(?))=?', [prefix, prefix]);
  } finally {
    await browser.close();
  }
}
