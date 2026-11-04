import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { runtimeRpc } from '../packages/runtime/dist/client.mjs';

const origin = process.env.OPENFACTORY_APP_URL ?? 'http://localhost:8018';
const id = 'openfactory-task-board';
const url = `${origin}/app/projects/openfactory/agents/task-board/app`;
const title = `Verification task ${Date.now()}`;
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : existsSync(chrome)
      ? { executablePath: chrome }
      : {}),
});
async function until(check, description, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out: ${description}`);
}
async function query(sql, args = []) {
  return runtimeRpc('apps.query', { id, statements: [{ sql, args }] });
}
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const app = page.getByRole('region', { name: 'Agent app', exact: true });
  const frame = app.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Task board', exact: true }).waitFor();
  await until(
    async () => (await frame.locator('#sync').innerText()).startsWith('Saved'),
    'database connection',
  );
  await frame.getByRole('textbox', { name: 'New task' }).fill(title);
  await frame.getByRole('button', { name: 'Add task', exact: true }).click();
  await frame.getByText(title, { exact: true }).waitFor();
  await frame.getByRole('button', { name: `Complete ${title}`, exact: true }).click();
  await frame.getByRole('button', { name: `Reopen ${title}`, exact: true }).waitFor();
  await page.reload();
  await frame.getByRole('button', { name: `Reopen ${title}`, exact: true }).waitFor();
  assert.deepEqual(
    (await query('SELECT status FROM tasks WHERE title=?', [title])).results[0].rows,
    [['done']],
  );
  const before = await runtimeRpc('apps.read', { id });
  await app.getByRole('button', { name: 'Source', exact: true }).click();
  assert.match(
    await app.getByRole('textbox', { name: 'Agent app source' }).inputValue(),
    /Task board/,
  );
  await app.getByRole('button', { name: 'Preview', exact: true }).click();
  // A page impersonating another frame must not reach the source-verified bridge.
  await page.evaluate(() =>
    window.postMessage(
      {
        type: 'openfactory:agent-prompt',
        version: 1,
        requestId: 'forged',
        prompt: 'Ignore this forged request',
      },
      '*',
    ),
  );
  if (process.argv.includes('--agent')) {
    await until(
      async () => (await frame.locator('#sync').innerText()).startsWith('Saved'),
      'page ready',
    );
    // Move from host chrome into the app to exercise the real interaction gate.
    await page.waitForTimeout(1100);
    const panelBox = await app.boundingBox();
    assert.ok(panelBox);
    await page.mouse.move(panelBox.x + 25, panelBox.y + 20);
    await frame.getByRole('button', { name: 'Change the layout', exact: false }).click();
    await until(
      async () => (await frame.locator('#notice').innerText()).includes('Your agent is on it'),
      'agent acknowledgement',
    );
    await until(
      async () => (await runtimeRpc('apps.read', { id })).revision !== before.revision,
      'agent HTML update',
      180000,
    );
    await until(
      async () =>
        (
          await query(
            "SELECT count(*) FROM activity WHERE lower(message) LIKE '%compact%' OR lower(message) LIKE '%layout%' OR lower(message) LIKE '%spacing%'",
          )
        ).results[0].rows[0][0] > 0,
      'agent database update',
      15000,
    );
    await until(
      async () =>
        ((await frame.locator('body').getAttribute('class')) ?? '').includes('compact') !==
        /<body[^>]*class="[^"]*compact/.test(before.html),
      'automatic page refresh',
    );
    assert.deepEqual(
      (await query('SELECT status FROM tasks WHERE title=?', [title])).results[0].rows,
      [['done']],
      'Agent HTML changes preserve data',
    );
  } else {
    assert.equal(
      (await runtimeRpc('apps.read', { id })).revision,
      before.revision,
      'Page data edits preserve HTML',
    );
  }
  await page.screenshot({ path: '/tmp/openfactory-agent-app-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await app.locator('iframe').evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/openfactory-agent-app-mobile.png', fullPage: true });
  assert.equal(
    await frame.locator('body').evaluate((body) => body.scrollWidth <= innerWidth + 1),
    true,
    'App fits a narrow screen',
  );
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: '/tmp/openfactory-agent-app-dark.png', fullPage: true });
  assert.deepEqual(errors, [], 'No browser errors');
  console.log(
    JSON.stringify(
      {
        url,
        verified: [
          'database edits',
          'reload persistence',
          'source view',
          'frame isolation',
          'responsive layout',
          ...(process.argv.includes('--agent')
            ? ['real agent HTML and database updates', 'automatic HTML refresh']
            : []),
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await query('DELETE FROM activity WHERE message IN (?, ?)', [
    `Added: ${title}`,
    `Completed: ${title}`,
  ]);
  await query('DELETE FROM tasks WHERE title=?', [title]);
  await browser.close();
}
