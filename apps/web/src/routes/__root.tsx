import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import stylesheet from '../styles.css?url';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Blackhole — Software factory' },
      {
        name: 'description',
        content: 'Your software factory workspace, powered by pnpm and Vite+.',
      },
    ],
    links: [{ rel: 'stylesheet', href: stylesheet }],
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
          <Outlet />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
