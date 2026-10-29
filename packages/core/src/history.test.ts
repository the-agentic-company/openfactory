import { describe, expect, it } from 'vite-plus/test';
import { projectAgentRuns, projectAgentConversations, groupArchivedConversations } from './history';
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

describe('run conversations', () => {
  it('keeps follow-ups and callbacks in the dispatched run, separating the next run and other agents', () => {
    const specs = [
      { id: 'first', task: 'operator', messageId: 'scheduled-task-message:operator:1:manual' },
      { id: 'callback', messageId: 'callback-1' },
      { id: 'followup', task: 'operator', messageId: 'openfactory-chat-message:followup' },
      { id: 'other', task: 'digest', messageId: 'scheduled-task-message:digest:2:scheduled' },
      { id: 'other-callback', messageId: 'callback-2' },
      { id: 'next', task: 'operator', messageId: 'scheduled-task-message:operator:3:scheduled' },
      { id: 'next-callback', messageId: 'callback-3' },
    ];
    const input = {
      thread: projection.thread,
      runs: specs.map((spec, index) => ({
        id: spec.id,
        ordinal: index + 1,
        userMessageId: spec.messageId,
        status: 'completed',
        requestedAt: time,
        startedAt: time,
        completedAt: time,
      })),
      messages: specs.flatMap((spec) => [
        {
          id: spec.messageId,
          runId: null,
          scheduledTaskId: spec.task,
          role: 'user',
          text: spec.id,
          createdAt: time,
        },
        {
          id: `answer-${spec.id}`,
          runId: spec.id,
          role: 'assistant',
          text: `Answer ${spec.id}`,
          createdAt: time,
        },
      ]),
    };
    const runs = projectAgentConversations(input, 'operator');
    expect(runs.map((run) => run.id)).toEqual(['first', 'next']);
    expect(runs[0].messages.map((message) => message.text)).toEqual([
      'first',
      'Answer first',
      'callback',
      'Answer callback',
      'followup',
      'Answer followup',
    ]);
    expect(runs[1].messages.map((message) => message.text)).toEqual([
      'next',
      'Answer next',
      'next-callback',
      'Answer next-callback',
    ]);
  });
});

it('keeps a reply on its originating run after a newer dispatch', () => {
  const specs = [
    { id: 'first', messageId: 'scheduled-task-message:operator:1:manual' },
    { id: 'second', messageId: 'scheduled-task-message:operator:2:scheduled' },
    { id: 'reply', messageId: 'openfactory-run-message:first:request-id' },
  ];
  const input = {
    thread: projection.thread,
    runs: specs.map((spec, index) => ({
      id: spec.id,
      ordinal: index + 1,
      userMessageId: spec.messageId,
      status: index === 2 ? 'running' : 'completed',
      requestedAt: time,
      startedAt: time,
      completedAt: index === 2 ? null : time,
    })),
    messages: specs.map((spec) => ({
      id: spec.messageId,
      runId: spec.id,
      scheduledTaskId: 'operator',
      role: 'user',
      text: spec.id,
      createdAt: time,
    })),
  };
  const runs = projectAgentConversations(input, 'operator');
  expect(runs.map((run) => run.id)).toEqual(['first', 'second']);
  expect(runs[0].messages.map((message) => message.text)).toEqual(['first', 'reply']);
  expect(runs[0].status).toBe('running');
  expect(runs[0].completedAt).toBeNull();
  expect(runs[1].messages.map((message) => message.text)).toEqual(['second']);
});
it('shows an imported session once with all of its messages in chronological order', () => {
  const turns = projectAgentRuns(projection, 'operator', 'coordinator').map(
    (run): ReturnType<typeof projectAgentRuns>[number] => ({
      ...run,
      source: 'codex_archive',
    }),
  );
  const runs = groupArchivedConversations([...turns].reverse());
  expect(runs).toHaveLength(1);
  expect(runs[0].title).toBe('Imported conversation');
  expect(new Set(runs[0].messages.map((message) => message.id))).toEqual(
    new Set(turns.flatMap((run) => run.messages.map((message) => message.id))),
  );
});
