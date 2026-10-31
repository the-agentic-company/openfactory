import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vite-plus/test';
import type { PullRequestSnapshot } from '@openfactory/core';
import { readPullRequestSnapshot, savePullRequestSnapshot } from './pull-request-snapshots.server';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
it('restores a durable first-render snapshot independently of browser storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openfactory-pr-snapshot-'));
  directories.push(directory);
  const snapshot: PullRequestSnapshot = {
    scope: 'host-a',
    project: '/repo',
    days: 30,
    updatedAt: Date.now(),
    result: { pulls: [], repositories: [], unavailable: [], unlinked: [], limited: false },
  };
  expect(await readPullRequestSnapshot(snapshot, directory)).toBeNull();
  await savePullRequestSnapshot(snapshot, directory);
  expect(await readPullRequestSnapshot(snapshot, directory)).toEqual(snapshot);
  expect(await readPullRequestSnapshot({ ...snapshot, scope: 'host-b' }, directory)).toBeNull();
  expect(await readPullRequestSnapshot({ ...snapshot, project: '/other' }, directory)).toBeNull();
  expect(await readPullRequestSnapshot({ ...snapshot, days: 7 }, directory)).toBeNull();
  await savePullRequestSnapshot({ ...snapshot, updatedAt: Date.now() - 31 * 86400000 }, directory);
  expect(await readPullRequestSnapshot(snapshot, directory)).toBeNull();
});
