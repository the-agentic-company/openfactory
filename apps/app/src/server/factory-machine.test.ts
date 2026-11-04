import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { AgentRuntime } from '../../../../packages/runtime/src/runtime';
import { runtimeRpc } from '@openfactory/runtime/client';
import { computerWorkspaceSchema } from '../computer-workspaces';
import { readComputerWorkspace } from './computer-workspaces.server';
import { changeFactoryMachine } from './factory-machine';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ validator: () => ({ handler: (handler: unknown) => handler }) }),
}));
vi.mock('@openfactory/runtime/client', () => ({ runtimeRpc: vi.fn() }));
vi.mock('./computer-workspaces.server', () => ({ readComputerWorkspace: vi.fn() }));
vi.mock('./native-runtime.server', () => ({
  connectionPreferences: async () => ({
    computers: [{ id: 'server', origin: 'https://server.ts.net', token: 'test' }],
  }),
  localNativeConnection: async () => ({ origin: 'http://localhost', token: 'test' }),
}));
let directory: string;
let local: AgentRuntime;
let server: AgentRuntime;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'factory-handoff-'));
  local = new AgentRuntime(join(directory, 'local-runtime'));
  server = new AgentRuntime(join(directory, 'server-runtime'));
  for (const [name, runtime] of [
    ['local', local],
    ['server', server],
  ] as const) {
    const workspaceRoot = join(directory, name, 'repo');
    await mkdir(workspaceRoot, { recursive: true });
    execFileSync('git', ['init', '--quiet', workspaceRoot]);
    execFileSync('git', [
      '-C',
      workspaceRoot,
      'remote',
      'add',
      'origin',
      'https://github.com/org/repo.git',
    ]);
    await runtime.operations['projects.upsert']({ id: 'factory', title: 'Factory', workspaceRoot });
  }
  await server.operations['factory.machine']({
    projectId: 'factory',
    enabled: true,
    expectedRevision: 'initial',
  });
  vi.mocked(runtimeRpc).mockImplementation(async (method, payload, connection) =>
    (connection?.origin === 'http://localhost' ? local : server).operations[method](payload),
  );
  vi.mocked(readComputerWorkspace).mockImplementation(async (id) => {
    const { snapshot } = await (id === 'local' ? local : server).operations['workspace.snapshot'](
      {},
    );
    return computerWorkspaceSchema.parse({ projects: snapshot.projects, agents: [], profiles: {} });
  });
});
afterEach(async () => {
  await local.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
  vi.resetAllMocks();
});
const selection = {
  repository: 'github.com/org/repo',
  instances: [{ computerId: 'local', projectId: 'factory' }],
  destination: { computerId: 'local', projectId: 'factory' },
};
it('discovers and disables the previous machine even when the UI omitted its machine', async () => {
  await changeFactoryMachine({ data: selection });
  expect(
    (await local.operations['workspace.snapshot']({})).snapshot.projects[0]?.machineEnabled,
  ).toBe(true);
  expect(
    (await server.operations['workspace.snapshot']({})).snapshot.projects[0]?.machineEnabled,
  ).toBe(false);
});
it('keeps the previous assignment when a paired machine cannot be checked', async () => {
  vi.mocked(readComputerWorkspace).mockRejectedValue(new Error('Machine offline'));
  await expect(changeFactoryMachine({ data: selection })).rejects.toThrow('Machine offline');
  expect(
    (await local.operations['workspace.snapshot']({})).snapshot.projects[0]?.machineEnabled,
  ).toBe(false);
  expect(
    (await server.operations['workspace.snapshot']({})).snapshot.projects[0]?.machineEnabled,
  ).toBe(true);
});

it('switches every copy when an older machine omits repository metadata', async () => {
  const read = vi.mocked(readComputerWorkspace).getMockImplementation();
  if (!read) {
    throw new Error('Missing workspace fixture');
  }
  vi.mocked(readComputerWorkspace).mockImplementation(async (id) => {
    const workspace = await read(id);
    return id === 'server'
      ? {
          ...workspace,
          projects: workspace.projects.map((project) => ({ ...project, repository: null })),
        }
      : workspace;
  });
  await changeFactoryMachine({ data: selection });
  expect(
    (await local.operations['workspace.snapshot']({})).snapshot.projects[0]?.machineEnabled,
  ).toBe(true);
  expect(
    (await server.operations['workspace.snapshot']({})).snapshot.projects[0]?.machineEnabled,
  ).toBe(false);
});
