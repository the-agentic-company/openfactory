import { z } from 'zod';

export const pullRequestResultSchema = z.object({
  pulls: z.array(
    z.object({
      number: z.number().int().positive(),
      title: z.string(),
      url: z.string().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/),
      repository: z.string(),
      state: z.enum(['OPEN', 'DRAFT', 'MERGED', 'CLOSED']),
      author: z.string(),
      updatedAt: z.iso.datetime(),
      review: z.enum(['', 'APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']),
      checks: z.enum(['none', 'passed', 'pending', 'failed']),
      additions: z.number().int().nonnegative(),
      deletions: z.number().int().nonnegative(),
    }),
  ),
  repositories: z.array(z.string()),
  unavailable: z.array(z.string()),
  unlinked: z.array(z.string()),
  limited: z.boolean(),
});
export type PullRequestResult = z.infer<typeof pullRequestResultSchema>;

export const pullRequestSnapshotSchema = z.object({
  scope: z.string(),
  project: z.string(),
  days: z.union([z.literal(1), z.literal(7), z.literal(30)]),
  updatedAt: z.number(),
  result: pullRequestResultSchema,
});
export type PullRequestSnapshot = z.infer<typeof pullRequestSnapshotSchema>;
