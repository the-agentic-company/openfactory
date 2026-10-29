import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { parseAgentDefinition } from '@openfactory/core';
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
export class DefinitionConflictError extends Error {}

export function definitionDirectory(workspaceRoot: string) {
  if (!isAbsolute(workspaceRoot)) {
    throw new Error('Use an absolute repository directory.');
  }
  return join(workspaceRoot, 'factory');
}
function assertNativePath(root: string, target: string) {
  let current = root;
  for (const part of ['', ...relative(root, target).split('/').filter(Boolean)]) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`Factory files cannot use symbolic links: ${current}`);
    }
  }
}
export function definitionBindings(files: Record<string, string>) {
  const bindings: Record<string, string> = {};
  const ids = new Set<string>();
  for (const [path, source] of Object.entries(files)) {
    if (!path.startsWith('agents/')) {
      continue;
    }
    const id = parseAgentDefinition(source).id;
    if (!id) {
      throw new Error(`${path}: declare a stable id in agent frontmatter.`);
    }
    if (ids.has(id)) {
      throw new Error(`Duplicate factory agent ID: ${id}`);
    }
    ids.add(id);
    bindings[path] = id;
  }
  return bindings;
}
export function definitionRevision(files: Record<string, string>) {
  return createHash('sha256')
    .update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))))
    .digest('hex');
}
function loadDefinition(workspaceRoot: string) {
  const root = definitionDirectory(workspaceRoot);
  assertNativePath(root, root);
  if (!existsSync(root)) {
    return null;
  }
  const files: Record<string, string> = {};
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = join(directory, entry.name);
      const path = relative(root, target).split('\\').join('/');
      if (entry.isSymbolicLink()) {
        throw new Error(`Factory files cannot use symbolic links: ${target}`);
      }
      if (entry.isDirectory()) {
        if (path === 'agents' || path === 'teams' || /^(agents|teams)\/[^/]+$/.test(path)) {
          visit(target);
        }
      } else if (definitionPathSchema.safeParse(path).success) {
        if (lstatSync(target).size > 400000) {
          throw new Error(`Factory file is too large: ${path}`);
        }
        files[path] = readFileSync(target, 'utf8');
      }
    }
  }
  visit(root);
  definitionFilesSchema.parse({ files });
  return {
    files,
    bindings: definitionBindings(files),
    revision: definitionRevision(files),
    location: root,
  };
}

const saveJournalSchema = z.object({
  previous: z.record(definitionPathSchema, z.string()).nullable(),
  paths: z.array(definitionPathSchema),
});
function recoverSave(workspaceRoot: string) {
  const lock = join(workspaceRoot, 'factory.lock');
  if (!existsSync(lock)) {
    return;
  }
  if (lstatSync(lock).isSymbolicLink()) {
    throw new Error('Factory lock cannot be a symbolic link.');
  }
  const owner = join(lock, 'owner');
  if (existsSync(owner)) {
    const pid = z
      .number()
      .int()
      .positive()
      .parse(Number(readFileSync(owner, 'utf8')));
    try {
      process.kill(pid, 0);
      throw new DefinitionConflictError('Another factory save is in progress. Retry in a moment.');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') {
        throw error;
      }
    }
  } else if (Date.now() - statSync(lock).mtimeMs < 30000) {
    throw new DefinitionConflictError('Another factory save is in progress. Retry in a moment.');
  }
  const journalPath = join(lock, 'journal.json');
  if (existsSync(journalPath) && !existsSync(join(lock, 'committed'))) {
    const journal = saveJournalSchema.parse(JSON.parse(readFileSync(journalPath, 'utf8')));
    restoreFiles(workspaceRoot, journal.previous, journal.paths);
  }
  rmSync(lock, { recursive: true, force: true });
}
function restoreFiles(
  workspaceRoot: string,
  previous: Record<string, string> | null,
  paths: string[],
) {
  const root = definitionDirectory(workspaceRoot);
  for (const path of paths) {
    assertNativePath(root, join(root, path));
    if (!(path in (previous ?? {}))) {
      rmSync(join(root, path), { force: true });
    }
  }
  for (const [path, source] of Object.entries(previous ?? {})) {
    const target = join(root, path);
    assertNativePath(root, target);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, source);
  }
}
export function readDefinition(workspaceRoot: string) {
  definitionDirectory(workspaceRoot);
  recoverSave(workspaceRoot);
  return loadDefinition(workspaceRoot);
}

export async function saveDefinition(
  workspaceRoot: string,
  expectedRevision: string | null,
  definition: DefinitionFiles,
  beforeCommit?: () => void,
) {
  const { files } = definitionFilesSchema.parse(definition);
  const bindings = definitionBindings(files);
  const root = definitionDirectory(workspaceRoot);
  const lock = join(workspaceRoot, 'factory.lock');
  assertNativePath(root, root);
  recoverSave(workspaceRoot);
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
      throw error;
    }
    throw new DefinitionConflictError('Another factory save is in progress. Retry in a moment.');
  }
  writeFileSync(join(lock, 'owner'), String(process.pid));
  let current: ReturnType<typeof readDefinition> = null;
  let written = false;
  let releaseLock = true;
  try {
    current = loadDefinition(workspaceRoot);
    if ((current?.revision ?? null) !== expectedRevision) {
      throw new DefinitionConflictError(
        'The factory definition changed in another editor. Copy your edits, then reload files.',
      );
    }
    for (const path of Object.keys(files)) {
      assertNativePath(root, join(root, path));
    }
    const revision = definitionRevision(files);
    if (revision !== current?.revision) {
      mkdirSync(root, { recursive: true });
      writeFileSync(
        join(lock, 'journal.json'),
        JSON.stringify({ previous: current?.files ?? null, paths: Object.keys(files) }),
      );
      written = true;
      for (const [path, source] of Object.entries(files)) {
        const target = join(root, path);
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, source);
      }
      for (const path of Object.keys(current?.files ?? {})) {
        if (!(path in files)) {
          rmSync(join(root, path));
        }
      }
    }
    writeFileSync(join(lock, 'committed'), '');
    beforeCommit?.();
    return { files, bindings, revision, location: root };
  } catch (error) {
    if (written) {
      try {
        rmSync(join(lock, 'committed'), { force: true });
        restoreFiles(workspaceRoot, current?.files ?? null, Object.keys(files));
        if (!current && !readdirSync(root).length) {
          rmSync(root, { recursive: true });
        }
      } catch (rollbackError) {
        releaseLock = false;
        rmSync(join(lock, 'owner'), { force: true });
        utimesSync(lock, 0, 0);
        throw new AggregateError(
          [error, rollbackError],
          `Factory save and rollback failed. Original files remain in ${lock}/journal.json. Restore access and retry.`,
        );
      }
    }
    throw error;
  } finally {
    if (releaseLock) {
      rmSync(lock, { recursive: true, force: true });
    }
  }
}
