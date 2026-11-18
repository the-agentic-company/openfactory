import type { Chat, Message, Thread } from 'chat';
import { waitForReply, type AgentRuntime, type WaitOptions } from './agent-runtime';
import { agentFor, type ChannelsConfig } from './config';
import type { ConversationStore } from './conversations';

export type BridgeOptions = {
  chat: Chat;
  runtime: AgentRuntime;
  conversations: ConversationStore;
  config: ChannelsConfig;
  wait?: WaitOptions;
  log?: (line: string) => void;
};

/**
 * Connects Chat SDK events to OpenFactory sessions:
 * - a mention or direct message starts a session with the routed agent and follows the thread;
 * - later messages in that thread continue the same session;
 * - the run's final assistant message is posted back in the thread.
 */
export function bridgeChannels({
  chat,
  runtime,
  conversations,
  config,
  wait,
  log = () => {},
}: BridgeOptions) {
  async function answer(thread: Thread, message: Message) {
    const platform = thread.adapter.name;
    const route = config.platforms[platform];
    const text = withoutLeadingMention(message.text);
    if (!route || !text) {
      return;
    }
    const requestId = `${thread.id}:${message.id}`;
    await thread.startTyping('Working…').catch(() => {});
    try {
      const existing = conversations.get(thread.id);
      let receipt;
      if (existing) {
        receipt = await runtime.send({ threadId: existing.threadId, text, messageId: requestId });
      } else {
        const agentId = agentFor(route, nativeChannel(thread.channelId));
        receipt = await runtime.start({ agentId, text, requestId });
        conversations.set(thread.id, { agentId, threadId: receipt.threadId });
      }
      log(`${platform}: run ${receipt.runId} in session ${receipt.threadId}`);
      await thread.post({ markdown: await waitForReply(runtime, receipt, wait) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log(`${platform}: ${thread.id} failed: ${reason}`);
      await thread.post(`OpenFactory could not answer: ${reason}`);
    }
  }

  chat.onNewMention(async (thread, message) => {
    await thread.subscribe();
    await answer(thread, message);
  });
  chat.onDirectMessage(async (thread, message) => {
    await thread.subscribe();
    await answer(thread, message);
  });
  // Like Hermes: a channel message needs a tag to start, but once the bot is in a thread it
  // answers every reply there, except one that opens by addressing someone else ("@alice …").
  chat.onSubscribedMessage(async (thread, message) => {
    if (!message.isMention && !thread.isDM && addressesSomeoneElse(message.text)) {
      return;
    }
    await answer(thread, message);
  });

  /** Re-follows known threads after a restart (subscriptions live in memory). */
  return async function restoreSubscriptions() {
    const state = chat.getState();
    await Promise.all(conversations.keys().map((id) => state.subscribe(id)));
  };
}

/** `slack:C0123ABC` → `C0123ABC`. */
export function nativeChannel(channelId: string) {
  return channelId.slice(channelId.indexOf(':') + 1);
}

/** A message that opens with an @-mention is addressed to that person. */
export function addressesSomeoneElse(text: string) {
  return /^\s*(?:<@[^>]+>|@[\w.-]+)/.test(text);
}

/** Drops the bot mention that starts a message: `<@U123> hi`, `@bap hi`. */
export function withoutLeadingMention(text: string) {
  return text.replace(/^\s*(?:<@[^>]+>|@[\w.-]+)[\s,:]*/, '').trim();
}
