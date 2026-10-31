import { createFileRoute, notFound } from '@tanstack/react-router';
import { marketplaceKindSchema } from '@openfactory/core';
import { Marketplace } from '../components/marketplace';
export const Route = createFileRoute('/marketplace/{-$type}')({
  beforeLoad: ({ params }) => {
    const kind = marketplaceKindSchema.safeParse(params.type ?? 'factory');
    if (!kind.success) {
      throw notFound();
    }
    return { marketplaceKind: kind.data };
  },
  head: () => ({
    meta: [
      { title: 'Marketplace · OpenFactory' },
      {
        name: 'description',
        content:
          'Explore reusable factories, agents, automations, and teams. Browse example definitions and import from GitHub with the OpenFactory CLI.',
      },
    ],
  }),
  component: MarketplaceRoute,
});
function MarketplaceRoute() {
  return <Marketplace kind={Route.useRouteContext().marketplaceKind} />;
}
