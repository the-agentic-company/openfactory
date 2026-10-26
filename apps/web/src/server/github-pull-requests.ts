import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

const exec = promisify(execFile);
export function githubRepository(remote: string) {
  const match =
    /^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(
      remote.trim(),
    );
  return match?.[1] ?? null;
}
const checkSchema = z.union([
  z.object({
    __typename: z.literal('CheckRun'),
    status: z.string(),
    conclusion: z.string().nullable(),
  }),
  z.object({ __typename: z.literal('StatusContext'), state: z.string() }),
]);
export function checkSummary(
  checks: z.infer<typeof checkSchema>[],
): 'none' | 'failed' | 'pending' | 'passed' {
  if (checks.length === 0) {
    return 'none';
  }
  const states = checks.map((check) =>
    check.__typename === 'CheckRun'
      ? check.status === 'COMPLETED'
        ? check.conclusion
        : 'PENDING'
      : check.state,
  );
  if (
    states.some((state) =>
      [
        'FAILURE',
        'ERROR',
        'TIMED_OUT',
        'CANCELLED',
        'ACTION_REQUIRED',
        'STARTUP_FAILURE',
        'STALE',
      ].includes(state ?? ''),
    )
  ) {
    return 'failed';
  }
  if (states.some((state) => !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(state ?? ''))) {
    return 'pending';
  }
  return 'passed';
}
const pullRequestSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  isDraft: z.boolean(),
  author: z.object({ login: z.string() }).nullable(),
  updatedAt: z.iso.datetime(),
  reviewDecision: z.enum(['', 'APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']).nullable(),
  statusCheckRollup: z.array(checkSchema).nullable(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});

function pullRequestState(
  pr: z.infer<typeof pullRequestSchema>,
): 'DRAFT' | 'OPEN' | 'CLOSED' | 'MERGED' {
  return pr.state === 'OPEN' && pr.isDraft ? 'DRAFT' : pr.state;
}
export async function repositoryForWorkspace(workspaceRoot: string) {
  try {
    const { stdout } = await exec('git', ['remote', 'get-url', 'origin'], {
      cwd: workspaceRoot,
      timeout: 5000,
      maxBuffer: 10000,
    });
    return githubRepository(stdout);
  } catch {
    return null;
  }
}
export async function loadRepositoryPullRequests(repository: string, days: number) {
  const cutoff = Date.now() - days * 86400000;
  const since = new Date(cutoff).toISOString().slice(0, 10);
  const { stdout } = await exec(
    'gh',
    [
      'pr',
      'list',
      '--repo',
      repository,
      '--state',
      'all',
      '--limit',
      '100',
      '--search',
      `updated:>=${since} sort:updated-desc`,
      '--json',
      'number,title,url,state,isDraft,author,updatedAt,reviewDecision,statusCheckRollup,additions,deletions',
    ],
    {
      timeout: 30000,
      maxBuffer: 5000000,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
    },
  );
  return z
    .array(pullRequestSchema)
    .parse(JSON.parse(stdout))
    .filter((pr) => Date.parse(pr.updatedAt) >= cutoff)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      repository,
      state: pullRequestState(pr),
      author: pr.author?.login ?? 'ghost',
      updatedAt: pr.updatedAt,
      review: pr.reviewDecision ?? '',
      checks: checkSummary(pr.statusCheckRollup ?? []),
      additions: pr.additions,
      deletions: pr.deletions,
    }));
}
