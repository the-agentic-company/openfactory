import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import stylesheet from '../base.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'OpenFactory — Your agents, on your computers' },
      {
        name: 'description',
        content: 'Run agent factories on your own computers with OpenFactory.',
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
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
