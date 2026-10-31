import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import stylesheet from '../styles.css?url';

import { DesktopChrome } from '../components/desktop-chrome';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'OpenFactory — Agent workspace' },
      {
        name: 'description',
        content: 'Your agents, schedules, and runs. Run directly with Codex and Claude.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: stylesheet },
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/favicon.png' },
      { rel: 'apple-touch-icon', href: '/openfactory.png' },
    ],
  }),
  component: Root,
});

function Root() {
  const { queryClient } = Route.useRouteContext();
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <DesktopChrome />
          <Outlet />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
