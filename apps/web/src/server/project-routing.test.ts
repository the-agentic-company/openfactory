import { createMemoryHistory } from '@tanstack/react-router';
import { expect, it, vi } from 'vite-plus/test';
import { getRouter } from '../router';
import { agentName, projectAgent, projectName, projectWorkspace } from '../project-path';
import { getAgents } from './agents';

vi.mock('./agents', () => ({ getAgents: vi.fn() }));

vi.mock('../routes/docs.$', async () => {
  const { createFileRoute } = await import('@tanstack/react-router');
  return { Route: createFileRoute('/docs/$')({}) };
});

it('builds and matches real project routes without project query parameters', () => {
  const router = getRouter();
  router.update({
    context: router.options.context,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const location = router.buildLocation({
    to: '/app/projects/$project/$view',
    params: { project: 'mibba', view: 'runs' },
  });
  expect(location.href).toBe('/app/projects/mibba/runs');
  const matches = router.matchRoutes(location.pathname, {});
  expect(matches.at(-1)?.routeId).toBe('/app_/projects/$project/$view');
  expect(matches.at(-1)?.params).toMatchObject({ project: 'mibba', view: 'runs' });
  expect(router.buildLocation({ to: '/app' }).href).toBe('/app');
});

it('keeps agent and run context in real project routes', () => {
  const router = getRouter();
  router.update({
    context: router.options.context,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  expect(
    router.buildLocation({
      to: '/app/projects/$project/agents/$agent/{-$section}',
      params: {
        project: 'mibba',
        agent: agentName({
          id: 'blackhole:mibba:reliability-digest',
          title: 'Run reliability daily digest',
        }),
        section: undefined,
      },
    }).href,
  ).toBe('/app/projects/mibba/agents/reliability-digest');
  expect(
    router.buildLocation({
      to: '/app/projects/$project/threads/$thread/runs/$runId/{-$section}',
      params: { project: 'mibba', thread: 'thread-1', runId: 'run-1', section: undefined },
    }).href,
  ).toBe('/app/projects/mibba/threads/thread-1/runs/run-1');
  expect(router.matchRoutes('/app/projects/mibba/teams', {}).at(-1)?.routeId).toBe(
    '/app_/projects/$project/teams/{-$section}',
  );
});

it('does not register the old agent, run, or team routes', () => {
  const router = getRouter();
  for (const path of ['/agents/old', '/runs/old', '/teams']) {
    expect(router.matchRoutes(path, {}).at(-1)?.routeId).toBe('__root__');
  }
  expect(Object.keys(router.routesById)).not.toContain(
    '/app/projects/$project/runs/$runId/{-$section}',
  );
});

it('resolves only project names and rejects filesystem paths or ambiguous names', () => {
  const projects = [{ workspaceRoot: '/home/baptiste/git/mibba' }];
  expect(projectWorkspace('mibba', projects)).toBe('/home/baptiste/git/mibba');
  for (const name of ['/home/baptiste/git/mibba', 'missing', 'all']) {
    expect(() => projectWorkspace(name, projects)).toThrow();
  }
  expect(() =>
    projectWorkspace('mibba', [...projects, { workspaceRoot: '/other/mibba' }]),
  ).toThrow();
});

it('keeps a project route available when its runtime temporarily disconnects', async () => {
  vi.mocked(getAgents).mockResolvedValue({
    agents: [],
    projects: [],
    appearances: {},
    connected: false,
    native: false,
    cacheScope: 'test',
    error: 'The runtime is unavailable. Check the selected computer in Settings.',
    syncedAt: null,
  });
  const router = getRouter();
  router.update({
    history: createMemoryHistory({ initialEntries: ['/app/projects/mibba/agents'] }),
    context: router.options.context,
  });
  await router.load();
  const match = router.state.matches.at(-1);
  expect(match?.status).toBe('success');
  expect(match?.loaderData).toMatchObject({ connected: false });
});

it('uses readable folder and agent names without provider prefixes or encoded separators', () => {
  expect(projectName('/work/My Café Project/')).toBe('my-cafe-project');
  expect(projectName('C:\\work\\My Project')).toBe('my-project');
  expect(
    agentName({ id: 'blackhole:mibba:Reliability Digest', title: 'Run reliability daily digest' }),
  ).toBe('reliability-digest');
  expect(
    agentName({ id: 'e430825a-05ac-4f74-83ee-df9d79f4d34b', title: 'Daily Reliability Digest' }),
  ).toBe('daily-reliability-digest');
  const agents = [
    {
      id: 'blackhole:mibba:reliability-digest',
      title: 'Reliability digest',
      projectPath: '/work/mibba',
    },
    {
      id: 'other:openfactory:reliability-digest',
      title: 'Reliability digest',
      projectPath: '/work/openfactory',
    },
  ];
  expect(projectAgent('reliability-digest', '/work/mibba', agents).id).toBe(
    'blackhole:mibba:reliability-digest',
  );
  expect(projectWorkspace('my-cafe-project', [{ workspaceRoot: '/work/My Café Project/' }])).toBe(
    '/work/My Café Project/',
  );
  expect(() => projectAgent('blackhole:mibba:reliability-digest', '/work/mibba', agents)).toThrow();
  expect(() => projectAgent('reliability-digest', '/work/missing', agents)).toThrow();
});

it('opens agent sections directly and keeps section paths after reload', async () => {
  vi.mocked(getAgents).mockResolvedValue({
    agents: [],
    projects: [],
    appearances: {},
    connected: false,
    native: false,
    cacheScope: 'test',
    error: 'The runtime is unavailable. Check the selected computer in Settings.',
    syncedAt: null,
  });
  for (const section of ['runs', 'settings', 'definition'] as const) {
    const router = getRouter();
    const path = `/app/projects/mibba/agents/reliability-digest/${section}`;
    router.update({
      context: router.options.context,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    await router.load();
    expect(router.state.matches.at(-1)?.params).toMatchObject({
      project: 'mibba',
      agent: 'reliability-digest',
      section,
    });
    expect(router.state.matches.at(-1)?.status).toBe('success');
    expect(
      router.buildLocation({
        to: '/app/projects/$project/agents/$agent/{-$section}',
        params: { project: 'mibba', agent: 'reliability-digest', section },
      }).href,
    ).toBe(path);
  }
});

it('builds every project navigation page with clean paths', () => {
  const router = getRouter();
  for (const view of [
    'dashboard',
    'agents',
    'runs',
    'pull-requests',
    'scorers',
    'definition',
  ] as const) {
    const location = router.buildLocation({
      to: '/app/projects/$project/$view',
      params: { project: projectName('/work/My Project'), view },
    });
    expect(location.href).toBe(`/app/projects/my-project/${view}`);
    expect(router.matchRoutes(location.pathname, {}).at(-1)?.params).toMatchObject({
      project: 'my-project',
      view,
    });
  }
  expect(router.buildLocation({ to: '/app/settings' }).href).toBe('/app/settings');
});

it('keeps run and team sections in readable paths without losing the conversation', () => {
  const router = getRouter();
  for (const section of ['timeline', 'agents', 'scores', 'metadata'] as const) {
    const location = router.buildLocation({
      to: '/app/projects/$project/threads/$thread/runs/$runId/{-$section}',
      params: { project: 'mibba', thread: 'thread-1', runId: 'run-1', section },
    });
    expect(location.href).toBe(`/app/projects/mibba/threads/thread-1/runs/run-1/${section}`);
    const match = router.matchRoutes(location.pathname, {}).at(-1);
    expect(match?.params).toMatchObject({
      project: 'mibba',
      thread: 'thread-1',
      runId: 'run-1',
      section,
    });
    expect(match?.search).toEqual({});
  }
  const team = router.buildLocation({
    to: '/app/projects/$project/teams/{-$section}',
    params: { project: 'mibba', section: 'definition' },
  });
  expect(team.href).toBe('/app/projects/mibba/teams/definition');
  expect(router.matchRoutes(team.pathname, {}).at(-1)?.params).toMatchObject({
    project: 'mibba',
    section: 'definition',
  });
});

it('builds run sections without encoded IDs or a repeated conversation query', async () => {
  const { runPathParams } = await import('../run-path');
  const router = getRouter();
  const threadId =
    'thread:project:588b77ef-ea36-4c08-b724-b8bb7d6d4eac:7f8b1966-378b-4551-a832-a34fe2a60751';
  for (const section of [undefined, 'timeline', 'agents', 'scores', 'metadata'] as const) {
    const location = router.buildLocation({
      to: '/app/projects/$project/threads/$thread/runs/$runId/{-$section}',
      params: {
        ...runPathParams({
          project: 'mibba',
          threadId,
          id: `run:thread:${encodeURIComponent(threadId)}:ordinal:38`,
        }),
        section,
      },
    });
    expect(location.href).toBe(
      `/app/projects/mibba/threads/7f8b1966-378b-4551-a832-a34fe2a60751/runs/38${section ? `/${section}` : ''}`,
    );
    expect(router.matchRoutes(location.pathname, {}).at(-1)?.params).toMatchObject({
      project: 'mibba',
      thread: '7f8b1966-378b-4551-a832-a34fe2a60751',
      runId: '38',
      section,
    });
  }
});
