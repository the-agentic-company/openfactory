import { randomUUID } from 'node:crypto';
import {
  factoryTeamSetups,
  factoryYamlSchema,
  marketplaceKindSchema,
  marketplaceSourceSchema,
  parseAgentDefinition,
  parseTeamYaml,
  stringifyTeamDefinition,
  validateFactoryFile,
  type MarketplaceEntry,
  type MarketplaceKind,
} from '@openfactory/core';
import { z } from 'zod';
import {
  definitionBindings,
  definitionFilesSchema,
  definitionPathSchema,
  definitionRevision,
} from './definition-store';
import { marketplaceStarters } from './marketplace-starters';

async function github(path: string) {
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(
      `GitHub returned ${response.status}. Check the repository is public or try again after the rate limit resets.`,
    );
  }
  const text = await response.text();
  if (text.length > 4_000_000) {
    throw new Error('This repository response is too large.');
  }
  return JSON.parse(text) as unknown;
}

export function inspectMarketplaceFiles(
  source: string,
  files: Record<string, string>,
  description = '',
  stars: number | null = null,
) {
  definitionFilesSchema.parse({ files });
  for (const [path, content] of Object.entries(files)) {
    validateFactoryFile(path, content);
  }
  const factory = factoryYamlSchema.parse(
    validateFactoryFile('factory.yaml', files['factory.yaml'] ?? ''),
  );
  factoryTeamSetups(files, definitionBindings(files));
  const url = source.startsWith('openfactory/')
    ? null
    : `https://github.com/${source.replace('@', '/tree/')}`;
  const entries: MarketplaceEntry[] = [
    { source, kind: 'factory', name: 'factory', title: factory.name, description, url, stars },
  ];
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith('agents/')) {
      const agent = parseAgentDefinition(content);
      const name = path.split('/')[1] ?? '';
      const entry = {
        source,
        kind: 'agent',
        name,
        title: agent.description ?? name,
        description: agent.prompt.slice(0, 240),
        url,
        stars,
      } satisfies MarketplaceEntry;
      entries.push(entry);
      if (agent.schedule && agent.schedule.type !== 'manual') {
        entries.push({ ...entry, kind: 'automation' });
      }
    } else if (path.endsWith('/team.yaml')) {
      const team = parseTeamYaml(content);
      entries.push({
        source,
        kind: 'team',
        name: path.split('/')[1] ?? '',
        title: team.name,
        description: team.description,
        url,
        stars,
      });
    }
  }
  return { source, files, entries, revision: definitionRevision(files) };
}

export async function previewMarketplace(sourceInput: string) {
  const source = marketplaceSourceSchema.parse(sourceInput);
  const starter = marketplaceStarters.find((item) => item.source === source);
  if (starter) {
    return inspectMarketplaceFiles(source, starter.files, starter.description);
  }
  const [repository = '', revision] = source.split('@');
  const metadata = z
    .object({ description: z.string().nullable(), stargazers_count: z.number() })
    .parse(await github(`repos/${repository}`));
  const commit = z
    .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
    .parse(await github(`repos/${repository}/commits/${revision ?? 'HEAD'}`));
  const tree = z
    .object({
      truncated: z.boolean(),
      tree: z.array(
        z.object({
          path: z.string(),
          type: z.string(),
          mode: z.string(),
          size: z.number().optional(),
          sha: z.string(),
        }),
      ),
    })
    .parse(await github(`repos/${repository}/git/trees/${commit.sha}?recursive=1`));
  if (tree.truncated) {
    throw new Error(
      'The repository tree is too large. Use a dedicated repository for shared definitions.',
    );
  }
  const definitions = tree.tree.filter(
    (file) =>
      file.path.startsWith('factory/') &&
      definitionPathSchema.safeParse(file.path.slice('factory/'.length)).success,
  );
  if (!definitions.some((file) => file.path === 'factory/factory.yaml')) {
    throw new Error(
      'This repository has no factory/factory.yaml. Publish a factory definition first.',
    );
  }
  if (
    definitions.length > 100 ||
    definitions.some(
      (file) => file.type !== 'blob' || file.mode === '120000' || (file.size ?? 0) > 100000,
    ) ||
    definitions.reduce((sum, file) => sum + (file.size ?? 0), 0) > 1_000_000
  ) {
    throw new Error('Shared factories must use at most 100 regular files and 1 MB of definitions.');
  }
  const files: Record<string, string> = {};
  // Bound concurrent requests to avoid exhausting GitHub's unauthenticated quota at once.
  for (let index = 0; index < definitions.length; index += 5) {
    const batch = await Promise.all(
      definitions.slice(index, index + 5).map(async (file) => {
        const blob = z
          .object({ encoding: z.literal('base64'), content: z.string().max(150000) })
          .parse(await github(`repos/${repository}/git/blobs/${file.sha}`));
        return [
          file.path.slice('factory/'.length),
          Buffer.from(blob.content, 'base64').toString('utf8'),
        ] as const;
      }),
    );
    for (const [path, content] of batch) {
      files[path] = content;
    }
  }
  return inspectMarketplaceFiles(
    `${repository}@${commit.sha}`,
    files,
    metadata.description ?? '',
    metadata.stargazers_count,
  );
}

export async function marketplaceLeaderboard(kindInput: MarketplaceKind, query: string) {
  const kind = marketplaceKindSchema.parse(kindInput);
  const starters = marketplaceStarters
    .flatMap((item) => inspectMarketplaceFiles(item.source, item.files, item.description).entries)
    .filter(
      (item) =>
        item.kind === kind &&
        `${item.title} ${item.description} ${item.source}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  try {
    const search = new URLSearchParams({
      q: `topic:openfactory-${kind} ${query}`,
      sort: 'stars',
      order: 'desc',
      per_page: '20',
    });
    const response = z
      .object({
        items: z.array(
          z.object({
            full_name: marketplaceSourceSchema,
            description: z.string().nullable(),
            stargazers_count: z.number(),
            html_url: z.string().url(),
          }),
        ),
      })
      .parse(await github(`search/repositories?${search}`));
    const entries = response.items.map((repo) => ({
      source: repo.full_name,
      kind,
      name: 'factory',
      title: repo.full_name,
      description: repo.description ?? '',
      url: repo.html_url,
      stars: repo.stargazers_count,
    }));
    return { entries: [...entries, ...starters], warning: null };
  } catch (error) {
    return {
      entries: starters,
      warning: `${error instanceof Error ? error.message : String(error)} Bundled starters are still available. You can also open a repository directly.`,
    };
  }
}

export function mergeMarketplaceImport(
  current: Record<string, string>,
  preview: ReturnType<typeof inspectMarketplaceFiles>,
  kind: MarketplaceKind,
  name: string,
) {
  if (!preview.entries.some((entry) => entry.kind === kind && entry.name === name)) {
    throw new Error(
      `No ${kind} named ${name} in this repository. Use factory show to list its contents.`,
    );
  }
  const selected: Record<string, string> = {};
  if (kind === 'factory') {
    Object.assign(selected, preview.files);
  } else if (kind === 'team') {
    const path = `teams/${name}/team.yaml`;
    const team = parseTeamYaml(preview.files[path] ?? '');
    selected[path] = preview.files[path] ?? '';
    if (team.instructions) {
      selected[`teams/${name}/instructions.md`] =
        preview.files[`teams/${name}/instructions.md`] ?? '';
    }
    for (const member of Object.values(team.members)) {
      selected[member.agent] = preview.files[member.agent] ?? '';
    }
  } else {
    const path = `agents/${name}/agent.md`;
    selected[path] = preview.files[path] ?? '';
  }
  const factory = factoryYamlSchema.parse(
    validateFactoryFile('factory.yaml', preview.files['factory.yaml'] ?? ''),
  );
  const prefix = `import-${randomUUID()}`;
  const paths = new Map(
    Object.keys(selected)
      .filter((path) => path !== 'factory.yaml')
      .map((path) => {
        const [directory, name, filename] = path.split('/');
        return [path, `${directory}/${prefix}-${name}/${filename}`];
      }),
  );
  const files = { ...current };
  for (const [path, source] of Object.entries(selected)) {
    const target = paths.get(path);
    if (!target) {
      continue;
    }
    let content = source;
    if (path.startsWith('agents/')) {
      const agent = parseAgentDefinition(source);
      // JSON is a YAML subset; rebuilding frontmatter avoids executing or carrying runtime state.
      const { prompt, ...metadata } = agent;
      const harness = {
        type: agent.harness?.type ?? factory.agentDefaults.harness?.type ?? 'codex',
        model:
          agent.harness?.model ??
          factory.agentDefaults.harness?.model ??
          factory.agentDefaults.model ??
          'auto',
        options: agent.harness?.options,
      };
      content = `---\n${JSON.stringify({ ...metadata, harness, id: randomUUID(), enabled: false, runtimeMode: 'approval-required' })}\n---\n\n${prompt}\n`;
    } else if (path.endsWith('/team.yaml')) {
      const team = parseTeamYaml(source);
      content = stringifyTeamDefinition({
        ...team,
        members: Object.fromEntries(
          Object.entries(team.members).map(([id, member]) => [
            id,
            { ...member, agent: paths.get(member.agent) ?? member.agent },
          ]),
        ),
      });
    }
    files[target] = content;
  }
  definitionFilesSchema.parse({ files });
  factoryTeamSetups(files, definitionBindings(files));
  return { files };
}
