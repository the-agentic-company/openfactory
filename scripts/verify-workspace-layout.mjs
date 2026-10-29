import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const [origin = 'http://localhost:8018', project = 'openfactory'] = process.argv.slice(2);
const session = `workspace-layout-${process.pid}`;
function browser(...args) {
  const response = JSON.parse(
    execFileSync(
      'agent-browser',
      ['--session', session, '--args', '--no-sandbox', ...args, '--json'],
      {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      },
    ),
  );
  assert.ok(response.success, response.error);
  return response.data;
}
const base = `/projects/${encodeURIComponent(project)}`;
const pages = [
  '/',
  '/settings',
  ...['dashboard', 'agents', 'runs', 'pull-requests', 'scorers', 'definition', 'teams'].map(
    (view) => `${base}/${view}`,
  ),
];
try {
  browser('open', origin);
  browser('set', 'viewport', '1440', '1000');
  // Discover real detail links without starting or modifying any agents/runs.
  for (const view of ['agents', 'runs']) {
    browser('open', new URL(`${base}/${view}`, origin).href);
    browser('wait', view === 'runs' ? '.compact-run-list a, .runs-empty' : '.agent-grid');
    const { result: link } = browser(
      'eval',
      `document.querySelector('main a[href*="/${view === 'agents' ? 'agents' : 'threads'}/"]')?.getAttribute('href')`,
    );
    if (link) {
      pages.push(link);
    }
  }
  for (const [width, height] of [
    [1440, 1000],
    [2200, 1000],
    [390, 844],
  ]) {
    browser('set', 'viewport', `${width}`, `${height}`);
    let expected;
    for (const page of pages) {
      browser('open', new URL(page, origin).href);
      browser('wait', '.workspace-page-header');
      const { result: measurement } = browser(
        'eval',
        `(() => {
        const main = document.querySelector('main.workspace-page');
        const header = main.querySelector('.workspace-page-header');
        const content = main.querySelector('.workspace-page-content');
        const box = header.getBoundingClientRect();
        const mainBox = main.getBoundingClientRect();
        const crumb = main.querySelector('.workspace-page-breadcrumb');
        return {
          mainCount: document.querySelectorAll('main').length,
          headerCount: main.querySelectorAll('.workspace-page-header').length,
          inset: box.top - mainBox.top,
          left: box.left,
          height: box.height,
          gap: content.getBoundingClientRect().top - box.bottom,
          overflow: document.documentElement.scrollWidth > innerWidth,
          breadcrumbOverflow: crumb.scrollWidth > crumb.clientWidth + 1
        };
      })()`,
      );
      assert.equal(measurement.mainCount, 1, `${page}: one main`);
      assert.equal(measurement.headerCount, 1, `${page}: one header`);
      assert.equal(measurement.overflow, false, `${page}: viewport overflow at ${width}`);
      assert.equal(
        measurement.breadcrumbOverflow,
        false,
        `${page}: breadcrumb overflow at ${width}`,
      );
      const geometry = { inset: measurement.inset, left: measurement.left, gap: measurement.gap };
      expected ??= geometry;
      assert.deepEqual(geometry, expected, `${page}: shared page spacing at ${width}`);
      assert.equal(measurement.height, width > 740 ? 44 : 100, `${page}: stable header height`);
      process.stdout.write(`${width}px ${page}: ${JSON.stringify(measurement)}\n`);
    }
  }
} finally {
  browser('close');
}
