import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vite-plus/test';
import { parseAgentDefinition, parseTeamYaml } from '@openfactory/core';
import { AgentRuntime } from './runtime';
import { readDefinition } from './definition-store';
import { inspectMarketplaceFiles, mergeMarketplaceImport, previewMarketplace } from './marketplace';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});
it('imports a complete factory through RPC without replacing local files and keeps all imported agents paused', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openfactory-marketplace-'));
  directories.push(directory);
  const workspace = join(directory, 'project');
  await mkdir(workspace);
  const runtime = new AgentRuntime(join(directory, 'runtime'));
  try {
    await runtime.rpc('projects.upsert', {
      id: 'target',
      title: 'Existing project',
      workspaceRoot: workspace,
    });
    const previous = readDefinition(workspace);
    if (!previous) {
      throw new Error('Missing test definition');
    }
    const preview = await previewMarketplace('openfactory/code-review');
    const input = {
      projectId: 'target',
      source: preview.source,
      kind: 'factory',
      name: 'factory',
      revision: previous.revision,
      previewRevision: preview.revision,
    };
    await runtime.rpc('marketplace.add', input);
    const saved = readDefinition(workspace);
    expect(saved?.files['factory.yaml']).toEqual(previous.files['factory.yaml']);
    const agents = Object.entries(saved?.files ?? {})
      .filter(([path]) => path.startsWith('agents/'))
      .map(([, source]) => parseAgentDefinition(source));
    expect(agents).toHaveLength(2);
    expect(
      agents.every((agent) => !agent.enabled && agent.runtimeMode === 'approval-required'),
    ).toBe(true);
    expect(agents.map((agent) => agent.id)).not.toContain('reviewer');
    const teamSource =
      Object.entries(saved?.files ?? {}).find(([path]) => path.endsWith('/team.yaml'))?.[1] ?? '';
    const team = parseTeamYaml(teamSource);
    expect(Object.values(team.members).every((member) => Boolean(saved?.files[member.agent]))).toBe(
      true,
    );
    await expect(runtime.rpc('marketplace.add', input)).rejects.toThrow('target factory changed');
    await expect(
      runtime.rpc('marketplace.add', {
        ...input,
        revision: saved?.revision,
        previewRevision: 'stale',
      }),
    ).rejects.toThrow('source changed');
  } finally {
    await runtime.close();
  }
});
it('selectively imports agents, automations and teams with unique IDs and preserves the automation schedule', async () => {
  const guide = await previewMarketplace('openfactory/code-review');
  const current = { 'factory.yaml': guide.files['factory.yaml'] ?? '' };
  const single = mergeMarketplaceImport(current, guide, 'agent', 'reviewer');
  expect(Object.keys(single.files)).toHaveLength(2);
  const team = mergeMarketplaceImport(single.files, guide, 'team', 'code-review');
  expect(Object.keys(team.files)).toHaveLength(5);
  const automated = await previewMarketplace('openfactory/daily-brief');
  const result = mergeMarketplaceImport(team.files, automated, 'automation', 'daily-brief');
  const daily =
    Object.values(result.files).find(
      (source) => source.includes('Daily brief') && source.startsWith('---'),
    ) ?? '';
  expect(parseAgentDefinition(daily)).toMatchObject({
    enabled: false,
    schedule: { type: 'interval', everyMs: 86400000 },
  });
  expect(() => mergeMarketplaceImport(current, guide, 'automation', 'reviewer')).toThrow(
    'No automation',
  );
  const ids = Object.entries(result.files)
    .filter(([path]) => path.startsWith('agents/'))
    .map(([, source]) => parseAgentDefinition(source).id);
  expect(new Set(ids).size).toBe(ids.length);
});
it('rejects traversal paths, malformed definitions and broken team references before any write', async () => {
  const preview = await previewMarketplace('openfactory/code-review');
  expect(() =>
    inspectMarketplaceFiles('owner/repo', { ...preview.files, '../outside': 'bad' }),
  ).toThrow();
  expect(() =>
    inspectMarketplaceFiles('owner/repo', {
      ...preview.files,
      'agents/reviewer/agent.md': 'broken',
    }),
  ).toThrow();
  const files = { ...preview.files };
  delete files['agents/reviewer/agent.md'];
  expect(() => inspectMarketplaceFiles('owner/repo', files)).toThrow('missing agent');
});

it('fetches public GitHub definitions at one immutable commit and rejects symlinks', async () => {
  const { vi } = await import('vite-plus/test');
  const preview = await previewMarketplace('openfactory/code-review');
  const sha = 'a'.repeat(40);
  const requests: string[] = [];
  let symlink = false;
  vi.stubGlobal('fetch', async (url: string) => {
    requests.push(url);
    const path = new URL(url).pathname;
    let result: unknown;
    if (path.endsWith('/commits/HEAD')) {
      result = { sha };
    } else if (path.endsWith(`/git/trees/${sha}`)) {
      result = {
        truncated: false,
        tree: Object.entries(preview.files).map(([file, content], index) => ({
          path: `factory/${file}`,
          type: 'blob',
          mode: symlink ? '120000' : '100644',
          size: content.length,
          sha: String(index),
        })),
      };
    } else if (new URL(url).hostname === 'raw.githubusercontent.com') {
      const file = path.split('/factory/')[1] ?? '';
      return new Response(preview.files[file] ?? '');
    } else {
      result = { description: 'Shared reviewer', stargazers_count: 42 };
    }
    return new Response(JSON.stringify(result));
  });
  try {
    const remote = await previewMarketplace('example/reviewers');
    expect(remote.source).toBe(`example/reviewers@${sha}`);
    expect(remote.files).toEqual(preview.files);
    const beforeImport = requests.length;
    expect(await previewMarketplace(remote.source)).toEqual(remote);
    expect(requests).toHaveLength(beforeImport);
    expect(remote.entries[0]).toMatchObject({
      stars: 42,
      url: `https://github.com/example/reviewers/tree/${sha}`,
    });
    expect(requests).toContain(
      `https://api.github.com/repos/example/reviewers/git/trees/${sha}?recursive=1`,
    );
    symlink = true;
    await expect(previewMarketplace('example/reviewers')).rejects.toThrow('regular files');
  } finally {
    vi.unstubAllGlobals();
  }
});
