import { basename, resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  marketplaceKindSchema,
  marketplaceListingSchema,
  marketplacePreviewSchema,
  marketplaceSourceSchema,
} from '@openfactory/core';
import { runtimeRpc } from './client';
import { savedDefinitionSchema } from './definition-store';
import { projectSchema } from './contracts';

export async function factoryMarketplaceCommand(
  args: string[],
  { rpc = runtimeRpc, cwd = process.cwd() }: { rpc?: typeof runtimeRpc; cwd?: string } = {},
) {
  const [command, ...rest] = args;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      type: { type: 'string' },
      name: { type: 'string' },
      project: { type: 'string' },
      path: { type: 'string' },
      agent: { type: 'string' },
      automation: { type: 'string' },
      team: { type: 'string' },
      factory: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });
  const selections = marketplaceKindSchema.options.filter((kind) => values[kind] !== undefined);
  if (
    selections.length > 1 ||
    (selections.length > 0 && (values.type !== undefined || values.name !== undefined))
  ) {
    throw new Error(
      'Choose one of --factory, --agent, --automation, --team, or --type with --name.',
    );
  }
  if (values.project !== undefined && values.path !== undefined) {
    throw new Error('Choose either --project <project-id> or --path <directory>.');
  }
  const kind = marketplaceKindSchema.parse(selections[0] ?? values.type ?? 'factory');
  const name = values[kind] ?? values.name ?? 'factory';
  if (command === 'leaderboard' || command === 'find') {
    const result = marketplaceListingSchema.parse(
      await rpc('marketplace.leaderboard', { kind, query: positionals.join(' ') }),
    );
    const rows = result.entries
      .map(
        (entry) =>
          `${entry.stars === null ? 'starter' : `${entry.stars} stars`}\t${entry.source}\t${entry.kind}\t${entry.name}\t${entry.title}`,
      )
      .join('\n');
    return `${rows || 'No matching entries.'}\n${result.warning ?? ''}\nOpen a repository: openfactory factory show https://github.com/owner/repo\nImport into the current directory: openfactory factory add https://github.com/owner/repo${kind === 'factory' ? '' : ` --${kind} <name>`}`;
  }
  if (command === 'show' || command === 'add') {
    if (positionals.length !== 1) {
      throw new Error('Supply one GitHub repository URL, owner/repo, or bundled starter source.');
    }
    const source = marketplaceSourceSchema.parse(positionals[0]);
    const preview = marketplacePreviewSchema.parse(await rpc('marketplace.show', { source }));
    if (command === 'show') {
      return JSON.stringify(preview, null, 2);
    }
    if (!preview.entries.some((entry) => entry.kind === kind && entry.name === name)) {
      throw new Error(
        `No ${kind} named ${name} in this repository. Use factory show to list its contents.`,
      );
    }
    if (values['dry-run']) {
      return JSON.stringify(preview, null, 2);
    }
    let projectId = values.project;
    if (!projectId) {
      const workspaceRoot = await realpath(resolve(cwd, values.path ?? '.'));
      const workspace = z
        .object({ snapshot: z.object({ projects: z.array(projectSchema) }) })
        .parse(await rpc('workspace.snapshot', {}));
      const existing = workspace.snapshot.projects.find(
        (project) => project.workspaceRoot === workspaceRoot,
      );
      const project =
        existing ??
        projectSchema.parse(
          await rpc('projects.upsert', {
            id: workspaceRoot,
            title: basename(workspaceRoot),
            workspaceRoot,
          }),
        );
      projectId = project.id;
    }
    const current = savedDefinitionSchema.parse(await rpc('definitions.get', { projectId }));
    const result = await rpc('marketplace.add', {
      source: preview.source,
      kind,
      name,
      projectId,
      revision: current.revision,
      previewRevision: preview.revision,
    });
    return `${JSON.stringify(result, null, 2)}\nImported agents are paused. Review their instructions before enabling them.`;
  }
  throw new Error(
    'Usage: openfactory factory leaderboard|find [query] [--type factory|agent|automation|team] | show <github-url|owner/repo> | add <github-url|owner/repo> [--agent|--automation|--team <name>] [--path <directory> | --project <project-id>] [--dry-run]. Imports default to the current directory.',
  );
}
