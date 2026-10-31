import { createFileRoute, notFound } from '@tanstack/react-router';
import { marketplaceKindSchema } from '@openfactory/core';
import { marketplaceExamples } from '../marketplace-examples';
import { Marketplace } from '../components/marketplace';
export const Route = createFileRoute('/marketplace/$type/$slug')({
  loader: ({ params }) => {
    const kind = marketplaceKindSchema.safeParse(params.type);
    if (!kind.success) {
      throw notFound();
    }
    const entry = marketplaceExamples.find(
      (item) => item.kind === kind.data && item.slug === params.slug,
    );
    if (!entry) {
      throw notFound();
    }
    return entry;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title ?? 'Example'} · Marketplace · OpenFactory` }],
  }),
  component: MarketplaceDetailRoute,
});
function MarketplaceDetailRoute() {
  const entry = Route.useLoaderData();
  return <Marketplace kind={entry.kind} entry={entry} />;
}
