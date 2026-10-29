import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pullRequestSnapshotSchema, type PullRequestSnapshot } from '@openfactory/core';

type SnapshotKey = Pick<PullRequestSnapshot, 'scope' | 'project' | 'days'>;
const root = () =>
  join(
    process.env.OPENFACTORY_SETTINGS_DIR ?? join(homedir(), '.config/openfactory/workspace'),
    'cache/pull-requests',
  );
function filename(key: SnapshotKey) {
  return `${createHash('sha256')
    .update(JSON.stringify([key.scope, key.project, key.days]))
    .digest('hex')}.json`;
}
export async function readPullRequestSnapshot(key: SnapshotKey, directory = root()) {
  try {
    const snapshot = pullRequestSnapshotSchema.parse(
      JSON.parse(await readFile(join(directory, filename(key)), 'utf8')),
    );
    if (
      snapshot.scope !== key.scope ||
      snapshot.project !== key.project ||
      snapshot.days !== key.days ||
      Date.now() - snapshot.updatedAt > 30 * 86400000
    ) {
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}
export async function savePullRequestSnapshot(snapshot: PullRequestSnapshot, directory = root()) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, filename(snapshot));
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(pullRequestSnapshotSchema.parse(snapshot)), {
    mode: 0o600,
  });
  await rename(temporary, path);
}
