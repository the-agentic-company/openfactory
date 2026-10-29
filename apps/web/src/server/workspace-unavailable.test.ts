import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vite-plus/test';
import { WorkspaceUnavailable } from '../components/workspace-unavailable';

it('explains a runtime outage and offers recovery without requiring project data', () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceUnavailable, { error: 'The runtime is unavailable.', retry: () => {} }),
  );
  expect(html).toContain('Unable to load your factory');
  expect(html).toContain('The runtime is unavailable.');
  expect(html).toContain('Retry connection');
  expect(html).toContain('href="/app"');
});
