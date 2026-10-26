import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const filePath = z
  .string()
  .regex(/^(factory\.yaml|agents\/[A-Za-z0-9%_.!~*'()-]+\/agent\.md)$/)
  .refine((path) => !path.split('/').some((part) => part === '.' || part === '..'));
const manifestSchema = z.object({
  paths: z.array(filePath).max(1000),
  bindings: z.record(filePath, z.string()),
});
export type DefinitionFiles = { files: Record<string, string>; bindings: Record<string, string> };
export class DefinitionConflictError extends Error {}
function directory(id: string) {
  return join(
    process.env.OPENFACTORY_SETTINGS_DIR ?? join(homedir(), '.config/openfactory/workspace'),
    'definitions',
    createHash('sha256').update(id).digest('hex'),
  );
}
export async function readDefinition(id: string) {
  const root = directory(id);
  let revision: string;
  try {
    revision = z.uuid().parse((await readFile(join(root, 'current'), 'utf8')).trim());
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  const location = join(root, revision);
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(join(location, 'manifest.json'), 'utf8')),
  );
  const entries = await Promise.all(
    manifest.paths.map(
      async (path) => [path, await readFile(join(location, path), 'utf8')] as const,
    ),
  );
  return { revision, files: Object.fromEntries(entries), bindings: manifest.bindings, location };
}

export async function saveDefinition(
  id: string,
  expectedRevision: string | null,
  definition: DefinitionFiles,
  beforeCommit?: () => Promise<unknown>,
) {
  const root = directory(id);
  const manifest = manifestSchema.parse({
    paths: Object.keys(definition.files),
    bindings: definition.bindings,
  });
  await mkdir(root, { recursive: true, mode: 0o700 });
  const lock = join(root, 'save.lock');
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      let stale = false;
      try {
        const owner = z
          .number()
          .int()
          .positive()
          .parse(JSON.parse(await readFile(join(lock, 'owner'), 'utf8')));
        try {
          process.kill(owner, 0);
        } catch (failure) {
          stale = failure instanceof Error && 'code' in failure && failure.code === 'ESRCH';
        }
      } catch {
        // A process can exit between creating the lock and writing its owner.
        stale = Date.now() - (await stat(lock)).mtimeMs > 30000;
      }
      if (!stale) {
        throw new DefinitionConflictError(
          'Another factory save is in progress. Retry in a moment.',
        );
      }
      await rm(lock, { recursive: true, force: true });
      return saveDefinition(id, expectedRevision, definition, beforeCommit);
    }
    throw error;
  }
  const revision = randomUUID();
  const location = join(root, revision);
  const pending = join(root, `${revision}.pending`);
  let runtimeApplied = false;
  try {
    await writeFile(join(lock, 'owner'), JSON.stringify(process.pid), { mode: 0o600 });
    const current = await readDefinition(id);
    if ((current?.revision ?? null) !== expectedRevision) {
      throw new DefinitionConflictError(
        'The factory definition changed in another editor. Copy your edits, then reload files.',
      );
    }
    await mkdir(location, { mode: 0o700 });
    await Promise.all(
      manifest.paths.map(async (path) => {
        const target = join(location, path);
        await mkdir(join(target, '..'), { recursive: true, mode: 0o700 });
        await writeFile(target, definition.files[path], { mode: 0o600 });
      }),
    );
    await writeFile(join(location, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    await writeFile(pending, revision, { mode: 0o600 });
    if (beforeCommit) {
      await beforeCommit();
      runtimeApplied = true;
    }
    await rename(pending, join(root, 'current'));
    return { ...definition, revision, location };
  } catch (error) {
    await rm(location, { recursive: true, force: true });
    if (runtimeApplied) {
      throw new Error(
        'T3 was updated, but the file save failed. Reload the live agent before retrying.',
        { cause: error },
      );
    }
    throw error;
  } finally {
    await rm(pending, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
