import { createFileRoute } from '@tanstack/react-router';
import source from '../install.sh?raw';
import { desktopReleaseRepository } from '../download-builds';

export const Route = createFileRoute('/install.sh')({
  server: {
    handlers: {
      GET: () => {
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(desktopReleaseRepository)) {
          return new Response('The release repository is not configured correctly.', {
            status: 500,
          });
        }
        return new Response(
          source.replace('__OPENFACTORY_RELEASES_REPOSITORY__', desktopReleaseRepository),
          {
            headers: {
              'Content-Type': 'text/x-shellscript; charset=utf-8',
              'Cache-Control': 'public, max-age=300',
              'X-Content-Type-Options': 'nosniff',
            },
          },
        );
      },
    },
  },
});
