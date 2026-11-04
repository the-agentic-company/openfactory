import { z } from 'zod';

export const definitionPathSchema = z
  .string()
  .regex(
    /^(factory\.yaml|agents\/[A-Za-z0-9%_.!~*'()-]+\/agent\.md|teams\/[a-z][a-z0-9-]*\/(team\.yaml|instructions\.md))$/,
  )
  .refine((path) => !path.split('/').some((part) => part === '.' || part === '..'));
export const definitionFilesSchema = z.object({
  files: z
    .record(definitionPathSchema, z.string().max(100000))
    .refine((files) => 'factory.yaml' in files, 'Include factory.yaml.'),
});
export type DefinitionFiles = z.infer<typeof definitionFilesSchema>;
export const savedDefinitionSchema = definitionFilesSchema.extend({
  bindings: z.record(z.string(), z.string()),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  location: z.string(),
});
