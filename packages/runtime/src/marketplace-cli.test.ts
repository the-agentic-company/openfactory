import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vite-plus/test';
import { factoryMarketplaceCommand } from './marketplace-cli';
import { AgentRuntime } from './runtime';
import { readDefinition } from './definition-store';

let directory: string;
let runtime: AgentRuntime;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'openfactory-marketplace-cli-'));
  runtime = new AgentRuntime(join(directory, 'runtime'));
  await mkdir(join(directory, 'workspace'));
});
afterEach(async () => {
  await runtime.close();
  await rm(directory, { recursive: true, force: true });
});
function command(args: string[]) {
  return factoryMarketplaceCommand(args, {
    cwd: join(directory, 'workspace'),
    rpc: runtime.rpc.bind(runtime),
  });
}
it('imports a GitHub URL into the current directory without requiring registration or a destination flag', async () => {
  const output = await command([
    'add',
    'https://github.com/openfactory/code-review',
    '--agent',
    'reviewer',
  ]);
  expect(output).toContain('"imported": 1');
  const definition = readDefinition(join(directory, 'workspace'));
  expect(Object.keys(definition?.bindings ?? {})).toHaveLength(1);
  expect(
    Object.values(definition?.files ?? {}).some((source) => source.includes('Code reviewer')),
  ).toBe(true);
});
it('reuses the current directory’s existing factory, including a custom project ID', async () => {
  await runtime.rpc('projects.upsert', {
    id: 'custom-id',
    title: 'Existing factory',
    workspaceRoot: join(directory, 'workspace'),
  });
  const factory = readDefinition(join(directory, 'workspace'))?.files['factory.yaml'];
  await command(['add', 'openfactory/code-review', '--agent', 'reviewer']);
  expect(readDefinition(join(directory, 'workspace'))?.files['factory.yaml']).toBe(factory);
  expect(await runtime.rpc('workspace.snapshot', {})).toMatchObject({
    snapshot: { projects: [{ id: 'custom-id' }] },
  });
});
it('allows an optional directory or project override', async () => {
  const elsewhere = join(directory, 'elsewhere');
  await mkdir(elsewhere);
  await command(['add', '--path', elsewhere, 'openfactory/code-review', '--agent', 'reviewer']);
  expect(readDefinition(join(directory, 'workspace'))).toBeNull();
  expect(Object.keys(readDefinition(elsewhere)?.bindings ?? {})).toHaveLength(1);
  await command(['add', 'openfactory/code-review', '--agent', 'reviewer', '--project', elsewhere]);
  expect(Object.keys(readDefinition(elsewhere)?.bindings ?? {})).toHaveLength(2);
});
it('does not register a factory or write files on preview or invalid selection', async () => {
  const preview = await command([
    'add',
    'https://github.com/openfactory/code-review',
    '--agent',
    'reviewer',
    '--dry-run',
  ]);
  expect(preview).toContain('agents/reviewer/agent.md');
  expect(readDefinition(join(directory, 'workspace'))).toBeNull();
  await expect(command(['add', 'openfactory/code-review', '--agent', 'missing'])).rejects.toThrow(
    'No agent named missing',
  );
  expect(readDefinition(join(directory, 'workspace'))).toBeNull();
  await expect(
    command(['add', 'openfactory/code-review', '--path', '.', '--project', 'id']),
  ).rejects.toThrow('Choose either');
});
