import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.OPENFACTORY_APP_URL ?? 'http://127.0.0.1:8018';
const project = process.env.OPENFACTORY_MOBILE_PROJECT ?? 'openfactory';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : existsSync(chrome)
      ? { executablePath: chrome }
      : {}),
});

async function assertFits(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(
    dimensions.content <= dimensions.viewport,
    `Page overflows: ${JSON.stringify(dimensions)}`,
  );
  const bar = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox();
  const viewport = page.viewportSize();
  assert.ok(
    bar && viewport && bar.width <= viewport.width && bar.y + bar.height <= viewport.height + 1,
    'Bottom navigation remains inside the visible viewport',
  );
}

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  // Reproduce arriving on a phone with a collapsed desktop sidebar preference.
  await context.addInitScript(() => {
    if (window === window.top) {
      localStorage.setItem('openfactory-sidebar-collapsed', 'true');
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const bar = page.getByRole('navigation', { name: 'Mobile navigation' });
  const menu = page.getByRole('complementary', { name: 'Main menu' });
  const menuButton = bar.getByRole('button', { name: 'Menu', exact: true });
  await page.goto(`${origin}/app`);
  await bar.waitFor();
  await page.waitForFunction(
    () => document.querySelector('.sidebar')?.getAttribute('popover') === 'auto',
  );
  await page.getByRole('heading', { name: 'Overview', exact: true, level: 1 }).waitFor();

  for (const width of [320, 390, 740]) {
    await page.setViewportSize({ width, height: 844 });
    await assertFits(page);
    assert.equal(await menu.isVisible(), false, 'Sidebar is hidden until requested');
    await menuButton.tap();
    await menu.waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('.mobile-navigation button')?.getAttribute('aria-expanded') ===
        'true',
    );
    await menu.getByRole('link', { name: 'Overview', exact: true }).tap();
    await menu.waitFor({ state: 'hidden' });
    await page.waitForFunction(
      () =>
        document.querySelector('.mobile-navigation button')?.getAttribute('aria-expanded') ===
        'false',
    );
    await menuButton.tap();
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    await bar.getByRole('button', { name: 'Settings', exact: true }).tap();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await settings.waitFor();
    for (const label of ['Appearance', 'Computers', 'Devices & access']) {
      await settings.getByRole('button', { name: label, exact: true }).tap();
      const box = await settings.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, 'Settings fits the viewport');
    }
    await settings.getByRole('button', { name: 'Close settings' }).tap();
    await settings.waitFor({ state: 'hidden' });
    console.log(`Mobile navigation, settings, and saved collapse preference: ${width}px`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [view, heading] of [
    ['dashboard', 'Dashboard'],
    ['agents', 'Agents'],
    ['runs', 'Runs'],
    ['scorers', 'Scorers'],
    ['pull-requests', 'Pull requests'],
    ['definition', 'Factory definition'],
    ['teams', 'Teams'],
  ]) {
    await page.goto(`${origin}/app/projects/${encodeURIComponent(project)}/${view}`);
    await page.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor();
    await page.waitForFunction(
      () => document.querySelector('.sidebar')?.getAttribute('popover') === 'auto',
    );
    await assertFits(page);
    await menuButton.tap();
    await menu.getByText('Factories', { exact: true }).waitFor();
    const factorySummary = menu.locator('.all-factories-nav-group > summary').first();
    if (await factorySummary.count()) {
      await factorySummary.tap();
      await page.waitForFunction(
        () =>
          document.querySelector('.mobile-navigation button')?.getAttribute('aria-expanded') ===
          'true',
      );
    }
    await menu.getByRole('button', { name: 'Close menu' }).tap();
    console.log(`Factory page: ${view}`);
  }

  await page.goto(`${origin}/app/projects/${encodeURIComponent(project)}/agents`);
  await page.getByRole('heading', { name: 'Agents', level: 1, exact: true }).waitFor();
  await menu.waitFor({ state: 'hidden' });
  const agent = page.locator('.agent-grid a').first();
  await agent.waitFor();
  const href = await agent.getAttribute('href');
  assert.ok(href, 'A real agent is available for the mobile section checks');
  await page.goto(new URL(href, origin).href);
  const tabs = page.getByRole('navigation', { name: 'Agent sections' });
  await tabs.waitFor();
  for (const label of [
    'Overview',
    'App',
    'Database',
    'Runs & assistant',
    'Settings',
    'Definition',
  ]) {
    const tab = tabs.getByRole('button', { name: label, exact: true });
    await tab.tap();
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll('.section-tabs button')].some(
          (button) => button.textContent === text && button.getAttribute('aria-pressed') === 'true',
        ),
      label,
    );
    await assertFits(page);
    console.log(`Agent section: ${label}`);
  }

  await page.setViewportSize({ width: 640, height: 390 });
  await assertFits(page);
  await menuButton.tap();
  await menu.getByRole('button', { name: 'Close menu' }).tap();
  console.log('Phone landscape: 640 × 390');

  for (const width of [768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await bar.waitFor({ state: 'hidden' });
    await page.waitForFunction(
      () => document.querySelector('.sidebar')?.getAttribute('popover') === null,
    );
    await menu.waitFor();
    assert.equal(await menu.getAttribute('popover'), null, 'Desktop navigation is not a popover');
    await page.waitForFunction(() =>
      document.querySelector('.sidebar')?.classList.contains('sidebar--collapsed'),
    );
    console.log(`Desktop sidebar restored: ${width}px`);
  }
  await context.close();
  assert.deepEqual(errors, [], 'No uncaught browser errors');
} finally {
  await browser.close();
}
