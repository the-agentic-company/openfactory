import { createFileRoute } from '@tanstack/react-router';
import { marketplaceKindSchema } from '@openfactory/core';
import { Marketplace } from '../components/marketplace';
import { getAgents } from '../server/agents';

export const Route = createFileRoute('/app_/marketplace/{-$type}')({
  params: { parse: (params) => ({ type: marketplaceKindSchema.parse(params.type ?? 'factory') }) },
  loader: () => getAgents(),
  component: MarketplaceRoute,
});
function MarketplaceRoute() {
  const workspace = Route.useLoaderData();
  const { type } = Route.useParams();
  return <Marketplace kind={type} workspace={workspace} />;
}
