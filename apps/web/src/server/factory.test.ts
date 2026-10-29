import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (handler: unknown) => handler,
    }),
    handler: (handler: unknown) => handler,
  }),
}));
vi.mock('./runtime-rpc', () => ({ runtimeRpc: vi.fn() }));

import { getFactoryRuns } from './factory';
import { runtimeRpc } from './runtime-rpc';

const agent = (id: string, projectId: string) => ({
  id,
  projectId,
  title: id,
  prompt: 'Work on the factory',
  enabled: true,
  schedule: { type: 'interval', everyMs: 60000 },
  threadId: 'shared',
  modelSelection: { instanceId: 'codex', model: 'test' },
  nextRunAt: null,
  lastRunAt: null,
  lastRunStatus: 'never',
  lastRunError: null,
  runCount: 0,
});
const owners = ['factory-agent', undefined, 'other-agent', 'unknown-agent'];
const projection = {
  thread: { id: 'shared', title: 'Shared conversation' },
  runs: owners.map((_, index) => ({
    id: `run-${index}`,
    ordinal: index + 1,
    userMessageId: `message-${index}`,
    status: 'completed',
    requestedAt: '2026-10-29T10:00:00Z',
    startedAt: null,
    completedAt: null,
  })),
  messages: owners.map((scheduledTaskId, index) => ({
    id: `message-${index}`,
    runId: `run-${index}`,
    role: 'user',
    text: 'Request',
    createdAt: '2026-10-29T10:00:00Z',
    ...(scheduledTaskId ? { scheduledTaskId } : {}),
  })),
};

beforeEach(() => {
  vi.mocked(runtimeRpc).mockReset();
  vi.mocked(runtimeRpc).mockImplementation(async (method) => {
    if (method === 'agents.list') {
      return { tasks: [agent('factory-agent', 'factory'), agent('other-agent', 'other')] };
    }
    if (method === 'workspace.snapshot') {
      return {
        snapshot: {
          projects: [
            { id: 'factory', workspaceRoot: '/factory' },
            { id: 'other', workspaceRoot: '/other' },
            { id: 'empty', workspaceRoot: '/empty' },
          ],
          threads: ['factory', 'other', 'empty'].map((projectId) => ({
            id: projectId === 'factory' ? 'shared' : projectId,
            projectId,
            title: 'Shared conversation',
            createdAt: '2026-10-29T10:00:00Z',
          })),
        },
      };
    }
    if (method === 'sessions.read') {
      return { projection };
    }
    return { ...projection, messages: [] };
  });
});

describe('factory runs', () => {
  it.each(['/factory', 'factory'])(
    'only returns turns triggered by agents belonging to %s',
    async (project) => {
      const result = await getFactoryRuns({ data: { project } });
      expect(result.runs.map((run) => [run.id, run.agentId])).toEqual([['run-0', 'factory-agent']]);
      expect(runtimeRpc).toHaveBeenCalledWith('sessions.read', {
        threadId: 'shared',
        acceptBoundedSnapshot: false,
      });
    },
  );

  it('returns no conversations for a factory without agents', async () => {
    const result = await getFactoryRuns({ data: { project: '/empty' } });
    expect(result.runs).toEqual([]);
  });

  it('keeps All runs scoped to each factory’s agents', async () => {
    const result = await getFactoryRuns({ data: { project: 'all' } });
    expect(result.runs.map((run) => [run.projectId, run.agentId])).toEqual([
      ['factory', 'factory-agent'],
      ['other', 'other-agent'],
    ]);
  });
});
