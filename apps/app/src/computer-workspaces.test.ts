import { expect, it } from 'vite-plus/test';
import {
  computerWorkspaceSchema,
  factoryMachine,
  groupComputerFactories,
} from './computer-workspaces';

function workspace(
  path: string,
  repository: string | null,
  machineEnabled = true,
  title = 'Factory',
) {
  return computerWorkspaceSchema.parse({
    agents: [],
    profiles: {},
    projects: [{ id: 'same-id', title, workspaceRoot: path, repository, machineEnabled }],
  });
}
it('groups the same Git remote across different names and folders', () => {
  const groups = groupComputerFactories([
    { computerId: 'mac', workspace: workspace('/Users/me/project', 'github.com/org/repo', false) },
    {
      computerId: 'server',
      workspace: workspace('/srv/repo', 'github.com/org/repo', true, 'Renamed'),
    },
  ]);
  expect(groups).toHaveLength(1);
  expect(factoryMachine(groups[0]!)?.computerId).toBe('server');
  expect(groups[0]?.instances.map((entry) => entry.project.workspaceRoot)).toEqual([
    '/Users/me/project',
    '/srv/repo',
  ]);
});
it('keeps unrelated repositories with matching titles separate, including local-only factories', () => {
  expect(
    groupComputerFactories([
      { computerId: 'mac', workspace: workspace('/one', 'github.com/org/one') },
      { computerId: 'server', workspace: workspace('/two', 'github.com/org/two') },
      { computerId: 'a', workspace: workspace('/three', null) },
      { computerId: 'b', workspace: workspace('/three', null) },
    ]),
  ).toHaveLength(4);
});
it('requires machine selection when copies both have execution enabled', () => {
  const groups = groupComputerFactories([
    { computerId: 'mac', workspace: workspace('/one', 'github.com/org/repo') },
    { computerId: 'server', workspace: workspace('/two', 'github.com/org/repo') },
  ]);
  expect(groups[0] && factoryMachine(groups[0])).toBeUndefined();
});
it('groups a folder from an older machine without repository metadata with its known repository', () => {
  const groups = groupComputerFactories([
    {
      computerId: 'mac',
      workspace: workspace('/Users/me/OpenFactory', 'github.com/org/repo', false),
    },
    { computerId: 'server', workspace: workspace('/home/me/openfactory', null) },
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0]?.instances).toHaveLength(2);
  expect(groups[0] && factoryMachine(groups[0])?.computerId).toBe('server');
});
it('keeps an unknown folder separate when its name matches multiple repositories', () => {
  const groups = groupComputerFactories([
    { computerId: 'mac', workspace: workspace('/work/project', 'github.com/org/one') },
    { computerId: 'server', workspace: workspace('/work/project', 'github.com/org/two') },
    { computerId: 'other', workspace: workspace('/work/project', null) },
  ]);
  expect(groups).toHaveLength(3);
});
it('preserves disabled execution and revision when loading an older machine assignment', () => {
  const parsed = computerWorkspaceSchema.parse({
    agents: [],
    profiles: {},
    projects: [
      {
        id: 'factory',
        title: 'Factory',
        workspaceRoot: '/repo',
        runnerEnabled: false,
        runnerRevision: 'saved',
      },
    ],
  });
  expect(parsed.projects[0]?.machineEnabled).toBe(false);
  expect(parsed.projects[0]?.machineRevision).toBe('saved');
});
