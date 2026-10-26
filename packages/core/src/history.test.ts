import { describe, expect, it } from 'vite-plus/test';
import { projectAgentRuns } from './history';
const time = '2026-10-26T14:00:00.000Z';
const projection = {
  thread: { id: 'coordinator', title: 'Shared reliability coordinator' },
  runs: ['operator', 'digest', 'manual'].map((name, index) => ({
    id: name,
    ordinal: index + 1,
    userMessageId: `user-${name}`,
    status: index === 2 ? 'running' : 'completed',
    requestedAt: time,
    startedAt: time,
    completedAt: index === 2 ? null : time,
  })),
  messages: [
    ...['operator', 'digest', 'manual'].map((name) => ({
      id: `user-${name}`,
      runId: name,
      ...(name === 'manual' ? {} : { scheduledTaskId: name }),
      role: 'user',
      text: `Run ${name}`,
      createdAt: time,
    })),
    {
      id: 'result',
      runId: 'operator',
      role: 'assistant',
      text: 'Verified result',
      createdAt: time,
    },
    {
      id: 'system-secret',
      runId: 'operator',
      role: 'system',
      text: 'Private runtime config',
      createdAt: time,
    },
  ],
};
describe('agent run history', () => {
  it('keeps two schedules separate in a shared coordinator and labels shared turns', () => {
    const runs = projectAgentRuns(projection, 'operator', 'coordinator');
    expect(runs.map((run) => run.id)).toEqual(['operator', 'manual']);
    expect(runs.map((run) => run.source)).toEqual(['t3', 'coordinator']);
    expect(runs[0].messages.map((message) => message.text)).toEqual([
      'Run operator',
      'Verified result',
    ]);
    expect(runs[1].status).toBe('running');
    expect(runs[1].completedAt).toBeNull();
  });
  it('does not import unrelated manual turns from another conversation', () => {
    expect(projectAgentRuns(projection, 'digest', 'other').map((run) => run.id)).toEqual([
      'digest',
    ]);
  });
});
