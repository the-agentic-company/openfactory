import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

/** Links a chat thread (for example `slack:C123:1700000000.000100`) to an OpenFactory session. */
export type Conversation = { agentId: string; threadId: string };

export interface ConversationStore {
  get(chatThreadId: string): Conversation | undefined;
  set(chatThreadId: string, conversation: Conversation): void;
  keys(): string[];
}

const fileSchema = z.record(z.string(), z.object({ agentId: z.string(), threadId: z.string() }));

/** Persists the links in one JSON file so conversations survive a restart. */
export function fileConversationStore(path: string): ConversationStore {
  const entries = existsSync(path) ? fileSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) : {};
  return {
    get: (id) => entries[id],
    set(id, conversation) {
      entries[id] = conversation;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(`${path}.tmp`, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
      renameSync(`${path}.tmp`, path);
    },
    keys: () => Object.keys(entries),
  };
}

export function memoryConversationStore(): ConversationStore {
  const entries = new Map<string, Conversation>();
  return {
    get: (id) => entries.get(id),
    set: (id, conversation) => void entries.set(id, conversation),
    keys: () => [...entries.keys()],
  };
}
