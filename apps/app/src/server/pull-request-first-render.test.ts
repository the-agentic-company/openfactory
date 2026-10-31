import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it } from 'vite-plus/test';
import { PullRequests } from '../components/pull-requests';

it('includes saved PR rows in the first HTML response without a loading state', () => {
  const client = new QueryClient();
  try {
    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client },
        createElement(PullRequests, {
          project: '/repo',
          scope: 'host',
          snapshot: {
            scope: 'host',
            project: '/repo',
            days: 30,
            updatedAt: Date.now(),
            result: {
              pulls: [
                {
                  number: 42,
                  title: 'Saved pull request',
                  url: 'https://github.com/team/repo/pull/42',
                  repository: 'team/repo',
                  state: 'OPEN',
                  author: 'developer',
                  updatedAt: new Date().toISOString(),
                  review: '',
                  checks: 'passed',
                  additions: 3,
                  deletions: 1,
                },
              ],
              repositories: ['team/repo'],
              unavailable: [],
              unlinked: [],
              limited: false,
            },
          },
        }),
      ),
    );
    expect(html).toContain('Saved pull request');
    expect(html).not.toContain('Loading');
    expect(html).not.toContain('spinning');
  } finally {
    client.clear();
  }
});
