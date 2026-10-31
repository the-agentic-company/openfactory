import {
  marketplaceKindSchema,
  marketplaceListingSchema,
  marketplacePreviewSchema,
  marketplaceSelectionSchema,
} from '@openfactory/core';
import { savedDefinitionSchema } from '@openfactory/runtime/definitions';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';

export const getMarketplace = createServerFn({ method: 'GET' })
  .validator(z.object({ kind: marketplaceKindSchema, query: z.string().max(120) }))
  .handler(async ({ data }) =>
    marketplaceListingSchema.parse(await runtimeRpc('marketplace.leaderboard', data)),
  );
export const showMarketplaceSource = createServerFn({ method: 'GET' })
  .validator(marketplaceSelectionSchema.pick({ source: true }))
  .handler(async ({ data }) =>
    marketplacePreviewSchema.parse(await runtimeRpc('marketplace.show', data)),
  );
export const getImportTarget = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.string() }))
  .handler(
    async ({ data }) =>
      savedDefinitionSchema.parse(await runtimeRpc('definitions.get', data)).revision,
  );
export const addMarketplaceEntry = createServerFn({ method: 'POST' })
  .validator(
    marketplaceSelectionSchema.extend({
      projectId: z.string(),
      revision: z.string(),
      previewRevision: z.string(),
    }),
  )
  .handler(async ({ data }) =>
    z
      .object({ location: z.string(), imported: z.number() })
      .parse(await runtimeRpc('marketplace.add', data)),
  );
