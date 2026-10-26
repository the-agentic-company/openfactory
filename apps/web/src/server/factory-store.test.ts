import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vite-plus/test';
import {
  readAppearances,
  readScorers,
  readFactoryProfiles,
  removeScorer,
  writeAppearance,
  writeScorer,
  writeFactoryProfile,
} from './factory-store';
let directory = '';
let original: string | undefined;
beforeEach(async () => {
  original = process.env.OPENFACTORY_SETTINGS_DIR;
  directory = await mkdtemp(join(tmpdir(), 'openfactory-workspace-test-'));
  process.env.OPENFACTORY_SETTINGS_DIR = directory;
});
afterEach(async () => {
  if (original === undefined) {
    delete process.env.OPENFACTORY_SETTINGS_DIR;
  } else {
    process.env.OPENFACTORY_SETTINGS_DIR = original;
  }
  await rm(directory, { recursive: true, force: true });
});
it('saves agent icons independently and retains choices when replaced', async () => {
  await Promise.all([
    writeAppearance('agent/one', { kind: 'icon', name: 'shield' }),
    writeAppearance('agent:two', { kind: 'emoji', value: '🧪' }),
  ]);
  await writeAppearance('agent/one', { kind: 'icon', name: 'rocket' });
  expect(await readAppearances(['agent/one', 'agent:two', 'missing'])).toEqual({
    'agent/one': { kind: 'icon', name: 'rocket' },
    'agent:two': { kind: 'emoji', value: '🧪' },
  });
});
it('persists and deletes a real scorer definition', async () => {
  const scorer = {
    id: '69182512-b9ba-4e6d-929b-2faf98363377',
    name: 'Smoke test',
    project: '/project/mibba',
    agentId: null,
    rule: { type: 'contains', text: 'OK' },
    createdAt: '2026-10-28T10:00:00.000Z',
  };
  await writeScorer(scorer);
  expect(await readScorers()).toEqual([scorer]);
  await removeScorer(scorer.id);
  expect(await readScorers()).toEqual([]);
});
it('persists factory names and icons independently across updates', async () => {
  await Promise.all([
    writeFactoryProfile('factory/one', {
      title: 'Studio',
      icon: { kind: 'icon', name: 'rocket', color: 'blue' },
    }),
    writeFactoryProfile('factory:two', {
      title: 'Research',
      icon: { kind: 'icon', name: 'search', color: 'blue' },
    }),
  ]);
  await writeFactoryProfile('factory/one', {
    title: '  Studio — production  ',
    icon: { kind: 'icon', name: 'code', color: 'blue' },
  });
  expect(await readFactoryProfiles(['factory/one', 'factory:two', 'missing'])).toEqual({
    'factory/one': {
      title: 'Studio — production',
      icon: { kind: 'icon', name: 'code', color: 'blue' },
    },
    'factory:two': { title: 'Research', icon: { kind: 'icon', name: 'search', color: 'blue' } },
  });
  await expect(
    writeFactoryProfile('factory/one', {
      title: '   ',
      icon: { kind: 'icon', name: 'factory', color: 'blue' },
    }),
  ).rejects.toThrow();
  expect(await readFactoryProfiles(['factory/one'])).toEqual({
    'factory/one': {
      title: 'Studio — production',
      icon: { kind: 'icon', name: 'code', color: 'blue' },
    },
  });
});
it('loads existing factory icons and saves colored monograms and emoji', async () => {
  await mkdir(join(directory, 'factories'));
  const hash = createHash('sha256').update('legacy').digest('hex');
  await writeFile(
    join(directory, 'factories', `${hash}.json`),
    JSON.stringify({ title: 'Legacy', icon: 'rocket' }),
  );
  expect(await readFactoryProfiles(['legacy'])).toEqual({
    legacy: { title: 'Legacy', icon: { kind: 'icon', name: 'rocket' } },
  });
  await writeFactoryProfile('legacy', {
    title: 'Studio',
    icon: { kind: 'monogram', text: 'ST', color: 'teal' },
  });
  await writeFactoryProfile('emoji', {
    title: 'Engineering',
    icon: { kind: 'emoji', value: '🧑🏽‍💻' },
  });
  expect(await readFactoryProfiles(['legacy', 'emoji'])).toEqual({
    legacy: { title: 'Studio', icon: { kind: 'monogram', text: 'ST', color: 'teal' } },
    emoji: { title: 'Engineering', icon: { kind: 'emoji', value: '🧑🏽‍💻' } },
  });
});
it('keeps the shapes of legacy agent and factory icon aliases', async () => {
  await writeAppearance('legacy-code', { kind: 'icon', name: 'code' });
  await writeAppearance('legacy-shield', { kind: 'icon', name: 'shield' });
  await writeAppearance('new-code', { kind: 'icon', name: 'code', color: 'blue' });
  await mkdir(join(directory, 'factories'));
  const hash = createHash('sha256').update('legacy-factory').digest('hex');
  await writeFile(
    join(directory, 'factories', `${hash}.json`),
    JSON.stringify({ title: 'Legacy', icon: 'shield' }),
  );
  expect(await readAppearances(['legacy-code', 'legacy-shield', 'new-code'])).toEqual({
    'legacy-code': { kind: 'icon', name: 'code-2' },
    'legacy-shield': { kind: 'icon', name: 'shield-check' },
    'new-code': { kind: 'icon', name: 'code', color: 'blue' },
  });
  expect(await readFactoryProfiles(['legacy-factory'])).toEqual({
    'legacy-factory': { title: 'Legacy', icon: { kind: 'icon', name: 'shield-check' } },
  });
});
