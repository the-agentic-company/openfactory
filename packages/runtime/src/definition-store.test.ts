import { rmSync, mkdirSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { readDefinition, saveDefinition } from './definition-store';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'openfactory-definitions-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const definition = {
  files: {
    'factory.yaml': 'schemaVersion: v1alpha1\nname: review\n',
    'agents/reviewer/agent.md': '---\nid: reviewer-id\n---\nReview changes.\n',
  },
};
describe('repository factory files', () => {
  it('ignores the old hidden directory and saves only in factory', async () => {
    await mkdir(join(root, '.factory'));
    const oldPath = join(root, '.factory/factory.yaml');
    const oldSource = 'name: old hidden factory\n';
    await writeFile(oldPath, oldSource);
    expect(readDefinition(root)).toBeNull();

    const saved = await saveDefinition(root, null, definition);
    expect(saved.location).toBe(join(root, 'factory'));
    expect(readDefinition(root)?.files).toEqual(definition.files);
    expect(await readFile(oldPath, 'utf8')).toBe(oldSource);
  });
  it('writes directly to factory and detects external changes and added files', async () => {
    expect(readDefinition(root)).toBeNull();
    const saved = await saveDefinition(root, null, definition);
    expect(saved.location).toBe(join(root, 'factory'));
    expect(readDefinition(root)).toEqual(saved);
    expect(await readFile(join(root, 'factory/agents/reviewer/agent.md'), 'utf8')).toBe(
      definition.files['agents/reviewer/agent.md'],
    );
    await writeFile(join(saved.location, 'factory.yaml'), 'name: edited in editor\n');
    await mkdir(join(saved.location, 'agents/new'));
    await writeFile(
      join(saved.location, 'agents/new/agent.md'),
      '---\nid: new-agent\n---\nNew agent',
    );
    const external = readDefinition(root);
    expect(external?.revision).not.toBe(saved.revision);
    expect(external?.bindings).toEqual({
      'agents/new/agent.md': 'new-agent',
      'agents/reviewer/agent.md': 'reviewer-id',
    });
    let applied = false;
    await expect(
      saveDefinition(root, saved.revision, definition, () => {
        applied = true;
      }),
    ).rejects.toThrow('another editor');
    expect(applied).toBe(false);
    expect(readDefinition(root)).toEqual(external);
  });
  it('preserves revision on an unchanged save and restores files when runtime application fails', async () => {
    const saved = await saveDefinition(root, null, definition);
    expect(await saveDefinition(root, saved.revision, definition)).toEqual(saved);
    await expect(
      saveDefinition(
        root,
        saved.revision,
        { files: { ...definition.files, 'factory.yaml': 'name: rejected\n' } },
        () => {
          throw new Error('Runtime rejected');
        },
      ),
    ).rejects.toThrow('Runtime rejected');
    expect(readDefinition(root)).toEqual(saved);
  });
  it('rejects traversal, duplicate identities and symbolic links without writing outside the factory', async () => {
    await expect(
      saveDefinition(root, null, { files: { ...definition.files, '../../outside': 'unsafe' } }),
    ).rejects.toThrow();
    await expect(
      saveDefinition(root, null, {
        files: {
          ...definition.files,
          'agents/duplicate/agent.md': definition.files['agents/reviewer/agent.md'],
        },
      }),
    ).rejects.toThrow('Duplicate');
    await mkdir(join(root, 'outside'));
    await symlink(join(root, 'outside'), join(root, 'factory'));
    await expect(saveDefinition(root, null, definition)).rejects.toThrow('symbolic links');
  });
  it('keeps unrelated skills and assets while saving and deleting definition files', async () => {
    const saved = await saveDefinition(root, null, definition);
    await mkdir(join(saved.location, 'skills'), { recursive: true });
    await writeFile(join(saved.location, 'skills/SKILL.md'), 'Keep me.');
    const next = await saveDefinition(root, saved.revision, {
      files: {
        'factory.yaml': definition.files['factory.yaml'],
        'teams/engineering/team.yaml': 'name: Engineering',
        'teams/engineering/instructions.md': 'Review carefully.',
      },
    });
    expect(next.bindings).toEqual({});
    expect(await readFile(join(next.location, 'skills/SKILL.md'), 'utf8')).toBe('Keep me.');
    expect(readDefinition(root)).toEqual(next);
  });
});

it('retains the recovery journal if rollback fails and restores it on the next read', async () => {
  const saved = await saveDefinition(root, null, definition);
  const target = join(root, 'factory/factory.yaml');
  await expect(
    saveDefinition(
      root,
      saved.revision,
      { files: { ...definition.files, 'factory.yaml': 'name: changed' } },
      () => {
        // A filesystem failure also blocks rollback, without mocking the storage implementation.
        rmSync(target);
        mkdirSync(target);
        throw new Error('Runtime rejected');
      },
    ),
  ).rejects.toThrow('save and rollback failed');
  expect(await readFile(join(root, 'factory.lock/journal.json'), 'utf8')).toContain('name: review');
  await rm(target, { recursive: true });
  expect(readDefinition(root)).toEqual(saved);
});
