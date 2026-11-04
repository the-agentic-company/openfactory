import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vite-plus/test';
import { FactoriesOverview } from '../components/factories-overview';
import { WorkspaceUnavailable } from '../components/workspace-unavailable';

function renderRecovery(element: ReactNode, client = new QueryClient()) {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/app'] }),
  });
  const providers = { router, children: createElement(QueryClientProvider, { client }, element) };
  return renderToStaticMarkup(createElement(RouterContextProvider, providers));
}

it('explains a runtime outage and offers recovery without requiring project data', () => {
  const html = renderRecovery(
    createElement(WorkspaceUnavailable, { error: 'The runtime is unavailable.', retry: () => {} }),
  );
  expect(html).toContain('Unable to load your factory');
  expect(html).toContain('The runtime is unavailable.');
  expect(html).toContain('Retry connection');
  expect(html).toContain('href="/app/settings"');
  expect(html).toContain('Open Settings');
  expect(html).toContain('href="/app"');
  expect(html).toContain('aria-label="Mobile navigation"');
});

it('shows the outage and recovery actions directly in the overview', () => {
  const html = renderRecovery(
    createElement(FactoriesOverview, {
      agents: [],
      projects: [],
      error: 'Access was denied. Pair this computer again in Settings.',
      refreshing: false,
      onRefresh: () => {},
      onCreate: () => {},
    }),
  );
  expect(html).toContain('Unable to load your factories');
  expect(html).toContain('Access was denied. Pair this computer again in Settings.');
  expect(html).toContain('Retry connection');
  expect(html).toContain('href="/app/settings"');
  expect(html).not.toContain('No factories available');
  expect(html).not.toContain('Create agent');
});

it('shows connection progress in the overview while retrying', () => {
  const html = renderRecovery(
    createElement(FactoriesOverview, {
      agents: [],
      projects: [],
      error: 'Cannot connect.',
      refreshing: true,
      onRefresh: () => {},
      onCreate: () => {},
    }),
  );
  expect(html).toContain('Connecting…');
  expect(html).toContain('disabled');
});

it('names each computer and its address, with separate failures and a switch action', () => {
  const client = new QueryClient();
  client.setQueryData(['connection-settings'], {
    activeId: 'local',
    computerIcons: {},
    computers: [
      { id: 'local', name: 'This computer', local: true, origin: null },
      {
        id: 'server',
        name: 'Dell server',
        local: false,
        origin: 'https://dell.tailnet.ts.net:8445',
      },
    ],
    local: null,
  });
  client.setQueryData(['computer-health', 'local', null], {
    kind: 'unreachable',
    checkedAt: 1,
    checkedAtLabel: '12:00:00',
    detail: 'ECONNREFUSED',
    recommendation: 'Start or restart OpenFactory on this computer.',
  });
  client.setQueryData(['computer-health', 'server', 'https://dell.tailnet.ts.net:8445'], {
    kind: 'access-denied',
    checkedAt: 1,
    checkedAtLabel: '12:00:00',
    detail: 'HTTP 401',
    recommendation: 'Forget this computer and pair again.',
  });
  const html = renderRecovery(
    createElement(WorkspaceUnavailable, { error: 'Cannot connect.', retry: () => {} }),
    client,
  );
  expect(html).toContain('Your computers');
  expect(html).toContain('This computer');
  expect(html).toContain('Dell server');
  expect(html).toContain('https://dell.tailnet.ts.net:8445');
  expect(html).toContain('OpenFactory is not accepting connections');
  expect(html).toContain('Start or restart OpenFactory');
  expect(html).toContain('Access denied');
  expect(html).toContain('pair again');
  expect(html).toContain('Workspace open');
  expect(html).toContain('Open workspace');
  expect(html).not.toContain('OpenFactory is running');
});
