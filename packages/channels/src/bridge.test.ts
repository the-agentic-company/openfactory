import type { Chat, Message, Thread } from 'chat';
import { describe, expect, it } from 'vite-plus/test';
import type { AgentRuntime } from './agent-runtime';
import { bridgeChannels, withoutLeadingMention } from './bridge';
import { memoryConversationStore } from './conversations';

type Handler = (thread: Thread, message: Message) => Promise<void>;

function setup(runtimeOverrides: Partial<AgentRuntime> = {}) {
  const handlers: Record<string, Handler> = {};
  const subscribed: string[] = [];
  const chat = {
    onNewMention: (handler: Handler) => void (handlers.mention = handler),
    onDirectMessage: (handler: Handler) => void (handlers.direct = handler),
    onSubscribedMessage: (handler: Handler) => void (handlers.subscribed = handler),
    getState: () => ({ subscribe: async (id: string) => void subscribed.push(id) }),
  } as unknown as Chat;
  const calls: unknown[] = [];
  let runs = 0;
  const runtime: AgentRuntime = {
    start: async (input) => (calls.push(['start', input]), { runId: `r${++runs}`, threadId: 't1' }),
    send: async (input) => (calls.push(['send', input]), { runId: `r${++runs}`, threadId: 't1' }),
    read: async ({ runId }) => ({
      status: 'completed',
      error: null,
      replies: ['…', `done ${runId}`],
    }),
    ...runtimeOverrides,
  };
  const conversations = memoryConversationStore();
  const restore = bridgeChannels({
    chat,
    runtime,
    conversations,
    config: {
      platforms: { slack: { agentId: 'default-agent', channels: { COPS: 'ops-agent' } } },
    },
    wait: { intervalMs: 1 },
  });
  const posts: unknown[] = [];
  const thread = (channel: string) =>
    ({
      id: `slack:${channel}:1.0`,
      channelId: `slack:${channel}`,
      adapter: { name: 'slack' },
      isDM: channel.startsWith('D'),
      subscribe: async () => void subscribed.push(`slack:${channel}:1.0`),
      startTyping: async () => {},
      post: async (message: unknown) => void posts.push(message),
    }) as unknown as Thread;
  const message = (id: string, text: string, isMention = false) =>
    ({ id, text, isMention }) as Message;
  return { handlers, calls, posts, conversations, subscribed, restore, thread, message };
}

describe('channel bridge', () => {
  it('starts a session on mention, continues it in the thread, and posts the final reply', async () => {
    const { handlers, calls, posts, thread, message } = setup();
    const ops = thread('COPS');
    await handlers.mention(ops, message('m1', '<@U1> deploy status?'));
    await handlers.subscribed(ops, message('m2', '<@U1> and staging?', true));
    expect(calls).toEqual([
      ['start', { agentId: 'ops-agent', text: 'deploy status?', requestId: 'slack:COPS:1.0:m1' }],
      ['send', { threadId: 't1', text: 'and staging?', messageId: 'slack:COPS:1.0:m2' }],
    ]);
    expect(posts).toEqual([{ markdown: 'done r1' }, { markdown: 'done r2' }]);
  });

  it('routes unlisted channels to the default agent and restores followed threads', async () => {
    const { handlers, calls, conversations, subscribed, restore, thread, message } = setup();
    await handlers.direct(thread('D1'), message('m1', 'hi'));
    expect(calls[0]).toMatchObject(['start', { agentId: 'default-agent' }]);
    expect(conversations.get('slack:D1:1.0')).toEqual({ agentId: 'default-agent', threadId: 't1' });
    subscribed.length = 0;
    await restore();
    expect(subscribed).toEqual(['slack:D1:1.0']);
  });

  it('reports a failed run in the thread', async () => {
    const { handlers, posts, thread, message } = setup({
      read: async () => ({ status: 'failed', error: 'model at capacity', replies: [] }),
    });
    await handlers.mention(thread('C1'), message('m1', '@bap help'));
    expect(posts).toEqual(['OpenFactory could not answer: model at capacity']);
  });

  it('after a tag, answers every reply in the thread except ones addressed to someone else', async () => {
    const { handlers, calls, thread, message } = setup();
    const channel = thread('C1');
    await handlers.mention(channel, message('m1', '@bap start', true));
    await handlers.subscribed(channel, message('m2', 'no tag needed'));
    await handlers.subscribed(channel, message('m3', '@alice can you check this?'));
    await handlers.subscribed(channel, message('m4', '@bap and you?', true));
    const dm = thread('D1');
    await handlers.direct(dm, message('d1', 'hello'));
    await handlers.subscribed(dm, message('d2', 'follow-up'));
    expect(calls.map((call) => (call as [string, { text: string }])[1].text)).toEqual([
      'start',
      'no tag needed',
      'and you?',
      'hello',
      'follow-up',
    ]);
  });

  it('strips only a leading mention', () => {
    expect(withoutLeadingMention('<@U123|bap>, ping @alice')).toBe('ping @alice');
    expect(withoutLeadingMention('@bap: hi')).toBe('hi');
    expect(withoutLeadingMention('hello @bap')).toBe('hello @bap');
  });
});
