import { z } from 'zod';

export const marketplaceKindSchema = z.enum(['factory', 'agent', 'automation', 'team']);
export type MarketplaceKind = z.infer<typeof marketplaceKindSchema>;
export const marketplaceSourceSchema = z
  .string()
  .regex(
    /^(?:openfactory\/[a-z-]+|[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+(?:@[a-f0-9]{40})?)$/,
  );
export const marketplaceSelectionSchema = z.object({
  source: marketplaceSourceSchema,
  kind: marketplaceKindSchema.default('factory'),
  name: z.string().min(1).max(200).default('factory'),
});
export const marketplaceEntrySchema = marketplaceSelectionSchema.extend({
  title: z.string(),
  description: z.string(),
  url: z.string().url().nullable(),
  stars: z.number().int().nonnegative().nullable(),
});
export const marketplaceListingSchema = z.object({
  entries: z.array(marketplaceEntrySchema),
  warning: z.string().nullable(),
});
export const marketplacePreviewSchema = z.object({
  source: marketplaceSourceSchema,
  entries: z.array(marketplaceEntrySchema),
  files: z.record(z.string(), z.string()),
  revision: z.string(),
});
export type MarketplaceEntry = z.infer<typeof marketplaceEntrySchema>;
