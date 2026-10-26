import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vite-plus/test';
import { checkSummary, githubRepository, repositoryForWorkspace } from './github-pull-requests';

it('identifies GitHub repos from HTTPS and SSH remotes without accepting other hosts', () => {
  for (const remote of [
    'https://github.com/team/repo.git',
    'git@github.com:team/repo.git',
    'ssh://git@github.com/team/repo.git',
    'https://github.com/team/repo/',
  ]) {
    expect(githubRepository(remote)).toBe('team/repo');
  }
  expect(githubRepository('https://github.com/team/repo.git.git')).toBe('team/repo.git');
  for (const remote of [
    'https://gitlab.com/team/repo',
    '/local/path',
    'https://github.com.evil.test/team/repo',
    'https://github.com/team/repo/extra',
  ]) {
    expect(githubRepository(remote)).toBeNull();
  }
});
it('summarizes both GitHub check runs and legacy commit statuses', () => {
  expect(checkSummary([])).toBe('none');
  expect(
    checkSummary([
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'StatusContext', state: 'SUCCESS' },
    ]),
  ).toBe('passed');
  expect(checkSummary([{ __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: null }])).toBe(
    'pending',
  );
  expect(
    checkSummary([
      { __typename: 'StatusContext', state: 'PENDING' },
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
    ]),
  ).toBe('failed');
  expect(
    checkSummary([{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' }]),
  ).toBe('passed');
  expect(checkSummary([{ __typename: 'StatusContext', state: 'ERROR' }])).toBe('failed');
});

it('discovers a real checkout’s GitHub origin and handles non-repositories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openfactory-pr-'));
  const exec = promisify(execFile);
  try {
    expect(await repositoryForWorkspace(directory)).toBeNull();
    await exec('git', ['init', directory]);
    await exec('git', ['remote', 'add', 'origin', 'git@github.com:team/project.git'], {
      cwd: directory,
    });
    expect(await repositoryForWorkspace(directory)).toBe('team/project');
    await exec('git', ['remote', 'set-url', 'origin', 'https://gitlab.com/team/project.git'], {
      cwd: directory,
    });
    expect(await repositoryForWorkspace(directory)).toBeNull();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
