import {
  marketplaceKindSchema,
  marketplaceListingSchema,
  marketplacePreviewSchema,
} from '@openfactory/core';
import { runtimeRpc } from './client';
import { savedDefinitionSchema } from './definition-store';

export async function factoryMarketplaceCommand(args: string[]) {
  const [command, ...rest] = args;
  const validFlags = [
    '--type',
    '--name',
    '--project',
    '--agent',
    '--automation',
    '--team',
    '--factory',
    '--dry-run',
  ];
  for (const argument of rest.filter((value) => value.startsWith('--'))) {
    if (!validFlags.includes(argument)) {
      throw new Error(`Unknown option ${argument}.`);
    }
  }
  const flag = (name: string) => {
    const index = rest.indexOf(name);
    if (index < 0) {
      return undefined;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Supply a value for ${name}.`);
    }
    return value;
  };
  const selections = marketplaceKindSchema.options.filter((kind) => rest.includes(`--${kind}`));
  if (
    selections.length > 1 ||
    (selections.length > 0 && (rest.includes('--type') || rest.includes('--name')))
  ) {
    throw new Error(
      'Choose one of --factory, --agent, --automation, --team, or --type with --name.',
    );
  }
  const kind = marketplaceKindSchema.parse(selections[0] ?? flag('--type') ?? 'factory');
  const name = flag(`--${kind}`) ?? flag('--name') ?? 'factory';
  if (command === 'leaderboard' || command === 'find') {
    const query = rest[0]?.startsWith('--') ? '' : (rest[0] ?? '');
    const result = marketplaceListingSchema.parse(
      await runtimeRpc('marketplace.leaderboard', { kind, query }),
    );
    const rows = result.entries
      .map(
        (entry) =>
          `${entry.stars === null ? 'starter' : `${entry.stars} stars`}\t${entry.source}\t${entry.kind}\t${entry.name}\t${entry.title}`,
      )
      .join('\n');
    return `${rows || 'No matching entries.'}\n${result.warning ?? ''}\nOpen a repository: openfactory factory show <owner/repo>\nImport: openfactory factory add <owner/repo> --type ${kind} --name <name> --project <project-id>`;
  }
  if (command === 'show' || command === 'add') {
    const source = rest[0];
    if (!source || source.startsWith('--')) {
      throw new Error('Supply an owner/repo or a bundled starter source.');
    }
    const preview = marketplacePreviewSchema.parse(
      await runtimeRpc('marketplace.show', { source }),
    );
    if (command === 'show' || rest.includes('--dry-run')) {
      return JSON.stringify(preview, null, 2);
    }
    const projectId = flag('--project');
    if (!projectId) {
      throw new Error(
        'Choose the target with --project <project-id>. Register a directory with openfactory project <path> first.',
      );
    }
    const current = savedDefinitionSchema.parse(await runtimeRpc('definitions.get', { projectId }));
    const result = await runtimeRpc('marketplace.add', {
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
    'Usage: openfactory factory leaderboard|find [query] [--type factory|agent|automation|team] | show <owner/repo> | add <owner/repo> --project <project-id> [--type <type>] [--name <name>] [--dry-run]',
  );
}
