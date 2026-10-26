import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { readDefinition, saveDefinition } from './definition-store';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'openfactory-definitions-'));
  vi.stubEnv('OPENFACTORY_SETTINGS_DIR', root);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});
const definition = {
  files: {
    'factory.yaml': 'schemaVersion: v1alpha1\nname: review\n',
    'agents/reviewer/agent.md': '---\n---\nReview changes.\n',
  },
  bindings: { 'agents/reviewer/agent.md': 'reviewer-id' },
};
describe('saved factory files', () => {
  it('writes native files and reloads the complete saved definition', async () => {
    expect(await readDefinition('project')).toBeNull();
    const saved = await saveDefinition('project', null, definition);
    expect(await readFile(join(saved.location, 'agents/reviewer/agent.md'), 'utf8')).toBe(
      definition.files['agents/reviewer/agent.md'],
    );
    expect(await readDefinition('project')).toEqual(saved);
    const next = await saveDefinition('project', saved.revision, {
      ...definition,
      files: { ...definition.files, 'factory.yaml': 'name: renamed\n' },
    });
    expect((await readDefinition('project'))?.revision).toBe(next.revision);
    expect(await readFile(join(saved.location, 'factory.yaml'), 'utf8')).toBe(
      definition.files['factory.yaml'],
    );
  });
  it('rejects stale edits before applying anything to the live runtime', async () => {
    const saved = await saveDefinition('project', null, definition);
    await saveDefinition('project', saved.revision, definition);
    let applied = false;
    await expect(
      saveDefinition('project', saved.revision, definition, async () => {
        applied = true;
      }),
    ).rejects.toThrow('another editor');
    expect(applied).toBe(false);
  });
  it('keeps the previous files when the runtime rejects a change', async () => {
    const saved = await saveDefinition('project', null, definition);
    await expect(
      saveDefinition('project', saved.revision, definition, async () => {
        throw new Error('T3 unavailable');
      }),
    ).rejects.toThrow('T3 unavailable');
    expect(await readDefinition('project')).toEqual(saved);
    await expect(saveDefinition('project', saved.revision, definition)).resolves.toHaveProperty(
      'revision',
    );
  });
  it('rejects path traversal before writing a revision', async () => {
    await expect(
      saveDefinition('project', null, { files: { '../../outside': 'unsafe' }, bindings: {} }),
    ).rejects.toThrow();
    expect(await readDefinition('project')).toBeNull();
  });
});
