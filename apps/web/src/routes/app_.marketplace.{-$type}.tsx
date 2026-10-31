import { createFileRoute, redirect } from '@tanstack/react-router';
import { marketplaceKindSchema } from '@openfactory/core';
export const Route = createFileRoute('/app_/marketplace/{-$type}')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/marketplace/{-$type}',
      params: {
        type:
          marketplaceKindSchema.parse(params.type ?? 'factory') === 'factory'
            ? undefined
            : marketplaceKindSchema.parse(params.type),
      },
      replace: true,
    });
  },
});
