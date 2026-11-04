import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vite-plus/test';
import { AllFactories, useComputerFactories } from '../components/all-factories';

function Overview() {
  return createElement(AllFactories, { data: useComputerFactories(), onCreate: () => {} });
}
function fixture() {
  const client = new QueryClient();
  client.setQueryData(['connection-settings'], {
    activeId: 'local',
    computerIcons: { server: 'server' },
    local: null,
    computers: [
      { id: 'local', name: 'MacBook', local: true, origin: null },
      { id: 'server', name: 'Dell server', local: false, origin: 'https://dell.example.ts.net' },
    ],
  });
  for (const [id, origin, path] of [
    ['local', null, '/Users/me/openfactory'],
    ['server', 'https://dell.example.ts.net', '/home/me/openfactory'],
  ]) {
    client.setQueryData(['computer-workspace', id, origin], {
      agents: [],
      profiles: {},
      projects: [
        {
          id: 'same-id',
          title: 'OpenFactory',
          workspaceRoot: path,
          repository: 'github.com/org/openfactory',
          machineEnabled: id === 'local',
        },
      ],
    });
  }
  return client;
}
function render(client: QueryClient) {
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(Overview)),
  );
}
it('keeps project settings and machine details out of the overview', () => {
  const html = render(fixture());
  expect(html).toContain('1 factory');
  expect(html).not.toContain('/Users/me/openfactory');
  expect(html).not.toContain('/home/me/openfactory');
  expect(html).not.toContain('aria-label="Settings for OpenFactory"');
  expect(html).not.toContain('aria-label="Machine for OpenFactory"');
  expect(html).not.toContain('Repository version unavailable');
  expect(html).toContain('Factories');
  expect(html).not.toContain('Change icon for Dell server');
});
it('keeps the factory visible when a machine is offline', () => {
  const client = fixture();
  client
    .getQueryCache()
    .find({ queryKey: ['computer-workspace', 'local', null] })
    ?.setState({ status: 'error', error: new Error('Cannot reach OpenFactory: ECONNREFUSED') });
  const html = render(client);
  expect(html).toContain('MacBook is offline');
  expect(html).toContain('showing last loaded data');
  expect(html).toContain('Factories');
});

it('groups a factory once while including distinct history from both computers', () => {
  const client = fixture();
  const now = new Date();
  const day = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const since = new Date(now);
  since.setDate(since.getDate() - 6);
  for (const [computer, origin, status, tokens] of [
    ['local', null, 'failed', 100],
    ['server', 'https://dell.example.ts.net', 'completed', 200],
  ]) {
    client.setQueryData(
      [
        'factory-overview',
        computer,
        origin,
        'same-id',
        day(since),
        day(now),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        7,
      ],
      {
        runs: [
          {
            id: 'same-id-on-different-computers',
            agentId: 'agent',
            threadId: 'thread',
            source: 'openfactory',
            title: 'Review',
            status,
            requestedAt: now.toISOString(),
            startedAt: null,
            completedAt: null,
          },
        ],
        usage: {
          readAt: now.toISOString(),
          sources: [{ status: 'ok' }],
          buckets: [
            {
              day: day(now),
              model: 'model',
              totals: {
                uncachedInputTokens: tokens,
                cachedInputTokens: 0,
                cacheCreationTokens: 0,
                outputTokens: 0,
              },
            },
          ],
        },
        pulls: { pulls: [], repositories: [], unavailable: [], unlinked: [], limited: false },
        issues: [],
        limited: false,
        historyLoaded: true,
        savedAt: now.toISOString(),
      },
    );
  }
  const html = render(client);
  expect(html).toContain('1 factory');
  expect(html.match(/class="overview-factory-button"/g)).toHaveLength(1);
  expect(html).toContain('<span>Completed</span><strong>1</strong>');
  expect(html).toContain('<span>Failed</span><strong>1</strong>');
  expect(html).toContain('<span>Tokens processed</span><strong>300</strong>');
  expect(html.match(/class="overview-run"/g)).toHaveLength(2);
});

it('shows recovery instead of onboarding when an offline computer has no saved factories', () => {
  const client = fixture();
  client.removeQueries({ queryKey: ['computer-workspace'] });
  for (const [id, origin] of [
    ['local', null],
    ['server', 'https://dell.example.ts.net'],
  ]) {
    client
      .getQueryCache()
      .build(client, { queryKey: ['computer-workspace', id, origin] })
      .setState({
        status: 'error',
        error: new Error('Cannot reach computer'),
        fetchStatus: 'idle',
      });
  }
  const html = render(client);
  expect(html).not.toContain('Your factories start here');
  expect(html).toContain('MacBook is offline');
  expect(html).toContain('Dell server is offline');
  expect(html).toContain('Retry');
});
