import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const appRequire = createRequire(new URL('../apps/app/package.json', import.meta.url));
const { createServer } = await import(appRequire.resolve('vite'));
const { default: react } = await import(appRequire.resolve('@vitejs/plugin-react'));
const root = new URL('../apps/app/', import.meta.url).pathname;
const server = await createServer({
  configFile: false,
  root,
  plugins: [
    react(),
    {
      name: 'visualization-verification',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.split('?')[0] !== '/visualization-test') {
            return next();
          }
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await server.transformIndexHtml(
              '/visualization-test',
              '<html><head></head><body><div id="root"></div><script type="module" src="/src/test-fixtures/visualizations.tsx"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('blocked.invalid')) {
      externalRequests.push(request.url());
    }
  });
  const url = `${server.resolvedUrls.local[0]}visualization-test`;
  await page.goto(url);
  const visuals = page.getByRole('region', { name: 'HTML visualization' });
  await visuals.nth(1).waitFor();
  assert.equal(await visuals.count(), 2, 'Only explicit assistant visual blocks render');
  const visual = visuals.first();
  const frame = visual.frameLocator('iframe');
  await frame.getByRole('heading', { name: 'Factory capacity' }).waitFor();
  assert.ok(
    await page.getByText('<b>Ordinary HTML</b>', { exact: true }).isVisible(),
    'Normal HTML stays source',
  );
  await frame.getByRole('button', { name: 'Update', exact: true }).click();
  await frame.getByRole('button', { name: 'Updated', exact: true }).waitFor();
  await visual.getByRole('button', { name: 'Source', exact: true }).click();
  assert.ok(
    await visual
      .getByRole('textbox', { name: 'Visualization source' })
      .inputValue()
      .then((text) => text.includes('Factory capacity')),
  );
  await visual.getByRole('button', { name: 'Preview', exact: true }).click();
  assert.ok(
    await frame.getByRole('button', { name: 'Updated', exact: true }).isVisible(),
    'Source toggle preserves state',
  );
  const before = await visual.locator('iframe').boundingBox();
  await frame.getByText('Details', { exact: true }).click();
  await page.waitForFunction(
    (oldHeight) =>
      Number(document.querySelector('.of-visual iframe').style.height.replace('px', '')) >
      oldHeight + 200,
    before.height,
  );
  await visual.getByRole('button', { name: 'Reset', exact: true }).click();
  await frame.getByRole('button', { name: 'Update', exact: true }).waitFor();
  if (process.env.VISUALIZATION_SCREENSHOT) {
    await visual.screenshot({ path: process.env.VISUALIZATION_SCREENSHOT });
  }
  await visual.getByRole('button', { name: 'Expand', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.frameLocator('iframe').getByRole('heading', { name: 'Factory capacity' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0);
  assert.equal(
    await visual
      .getByRole('button', { name: 'Expand', exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--color-text', '#abcdef');
    document.documentElement.style.colorScheme = 'dark';
  });
  await frame.locator('h1').evaluate(
    (node) =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Visualization theme did not update')),
          5000,
        );
        const check = () => {
          if (getComputedStyle(node).color === 'rgb(171, 205, 239)') {
            clearTimeout(timeout);
            resolve(true);
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      }),
  );
  await visuals.nth(1).frameLocator('iframe').getByText('Isolated 2', { exact: true }).waitFor();
  assert.equal(await page.locator('body').getAttribute('data-compromised'), null);
  assert.deepEqual(externalRequests, [], 'Fetch, external images and nested frames are blocked');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok((await visual.boundingBox()).width <= 390);
  assert.ok(
    await frame.locator('body').evaluate((node) => node.scrollWidth <= innerWidth),
    'Visual fits a phone',
  );
  await page.reload();
  await frame.getByRole('heading', { name: 'Factory capacity' }).waitFor();
  await page.goto(`${url}?oversize`);
  await page.getByText('Visual exceeds the 1 MB limit. Showing source.').waitFor();
  assert.equal(
    await page.locator('iframe[title="Interactive visualization"]').count(),
    2,
    'Oversize visual remains source',
  );
  assert.deepEqual(errors, []);
  process.stdout.write(
    'PASS: assistant-only visuals, interaction, source/state, reset, resizing, expand/Escape/focus, live theme, phone layout, reload, size limit and sandbox/network isolation.\n',
  );
} finally {
  await browser?.close();
  await server.close();
}
