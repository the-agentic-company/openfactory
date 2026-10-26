import { describe, expect, it } from 'vite-plus/test';
import { createFactoryFiles, validateFactoryFile } from './factory-definition';

describe('factory.yaml', () => {
  it('creates a valid empty factory', () => {
    const definition = createFactoryFiles('Empty project', []);
    expect(validateFactoryFile('factory.yaml', definition.files['factory.yaml']!)).toMatchObject({
      name: 'Empty project',
      repositories: [],
      agentDefaults: { model: 'auto' },
    });
    expect(definition.bindings).toEqual({});
  });
  it('preserves Warp configuration fields stored for future adapters', () => {
    expect(
      validateFactoryFile(
        'factory.yaml',
        'schemaVersion: v1alpha1\nname: project\nrepositories: []\nagentDefaults:\n  harness:\n    type: codex\n    model: example\nsecrets: [TOKEN]\n',
      ),
    ).toMatchObject({ secrets: ['TOKEN'] });
  });
  it.each([
    'schemaVersion: v2\nname: project\nrepositories: []\nagentDefaults: {model: auto}',
    'schemaVersion: v1alpha1\nname: project\nname: duplicate\nrepositories: []\nagentDefaults: {model: auto}',
    'schemaVersion: v1alpha1\nname: project\nrepositories: []\nagentDefaults: {}',
    'schemaVersion: v1alpha1\nname: project\nrepositories: []\nagentDefaults: {model: auto, harness: {type: codex, model: test}}',
  ])('rejects invalid or ambiguous factory configuration', (source) => {
    expect(() => validateFactoryFile('factory.yaml', source)).toThrow();
  });
});
