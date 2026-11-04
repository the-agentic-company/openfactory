import { afterEach, expect, it, vi } from 'vite-plus/test';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRepositoryPullRequests } from './github-pull-requests';

afterEach(() => vi.unstubAllEnvs());
it('keeps old open reviews in attention independently of the activity period', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'overview-reviews-'));
  try {
    const pull = {
      number: 1,
      title: 'Waiting for review',
      url: 'https://github.com/org/repo/pull/1',
      state: 'OPEN',
      isDraft: false,
      author: { login: 'author' },
      updatedAt: '2020-01-01T00:00:00Z',
      reviewDecision: 'REVIEW_REQUIRED',
      statusCheckRollup: [],
      additions: 1,
      deletions: 0,
    };
    const binary = join(directory, 'gh');
    const args = join(directory, 'args.json');
    await writeFile(
      binary,
      `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(args)}, JSON.stringify(process.argv.slice(2)));\nprocess.stdout.write(${JSON.stringify(JSON.stringify([pull]))});\n`,
    );
    await chmod(binary, 0o700);
    vi.stubEnv('PATH', `${directory}:${process.env.PATH}`);
    expect(await loadRepositoryPullRequests('org/repo', 7, 'open')).toMatchObject([
      { number: 1, review: 'REVIEW_REQUIRED' },
    ]);
    const invoked: string[] = JSON.parse(await readFile(args, 'utf8'));
    expect(invoked.slice(invoked.indexOf('--state'), invoked.indexOf('--state') + 2)).toEqual([
      '--state',
      'open',
    ]);
    expect(invoked[invoked.indexOf('--search') + 1]).toBe('sort:updated-desc');
    expect(await loadRepositoryPullRequests('org/repo', 7)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
