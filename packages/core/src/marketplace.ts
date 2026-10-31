import { z } from 'zod';

export const marketplaceKindSchema = z.enum(['factory', 'agent', 'automation', 'team']);
export type MarketplaceKind = z.infer<typeof marketplaceKindSchema>;
export const marketplaceSourceSchema = z
  .string()
  .trim()
  .transform((source) => {
    const github =
      /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/tree\/([a-f0-9]{40}))?\/?$/.exec(
        source,
      );
    return github ? `${github[1]}/${github[2]}${github[3] ? `@${github[3]}` : ''}` : source;
  })
  .pipe(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+(?:@[a-f0-9]{40})?$/));
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
