import { siteUrl } from '../site-url';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { marketplaceKindSchema } from '@openfactory/core';
export const Route = createFileRoute('/app_/marketplace/{-$type}')({
  beforeLoad: ({ params }) => {
    throw redirect({
      href: siteUrl(
        `/marketplace/${
          marketplaceKindSchema.parse(params.type ?? 'factory') === 'factory'
            ? ''
            : marketplaceKindSchema.parse(params.type)
        }`,
      ),
      replace: true,
    });
  },
});
