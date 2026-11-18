import { createMemoryState } from '@chat-adapter/state-memory';
import { Chat, type Adapter } from 'chat';
import { join } from 'node:path';
import { openFactoryRuntime } from './agent-runtime';
import { bridgeChannels } from './bridge';
import { channelsDirectory, loadChannelsConfig, loadChannelsEnv } from './config';
import { fileConversationStore } from './conversations';
import { missingEnv, platforms } from './platforms';

const [command] = process.argv.slice(2);
if (command !== 'serve') {
  process.stderr.write(
    'Usage: openfactory-channels serve\n' +
      `Reads channels.json and channels.env from ${channelsDirectory()} (OPENFACTORY_CHANNELS_DIR).\n`,
  );
  process.exit(command ? 1 : 0);
}

const directory = channelsDirectory();
loadChannelsEnv(directory);
const config = loadChannelsConfig(directory);
const adapters: Record<string, Adapter> = {};
for (const name of Object.keys(config.platforms)) {
  const platform = platforms[name];
  if (!platform) {
    throw new Error(`Unknown platform "${name}". Available: ${Object.keys(platforms).join(', ')}.`);
  }
  const missing = missingEnv(platform);
  if (missing.length) {
    throw new Error(`${name}: set ${missing.join(', ')} in the environment or channels.env.`);
  }
  adapters[name] = platform.create();
}
if (!Object.keys(adapters).length) {
  throw new Error('Configure at least one platform in channels.json.');
}

const chat = new Chat({
  userName: 'openfactory',
  adapters,
  state: createMemoryState(),
  // Messages sent while the agent works are answered in order, not dropped.
  concurrency: { strategy: 'queue', maxLockLifetimeMs: 60 * 60_000 },
});
const restore = bridgeChannels({
  chat,
  runtime: openFactoryRuntime(),
  conversations: fileConversationStore(join(directory, 'conversations.json')),
  config,
  log: (line) => process.stdout.write(`${line}\n`),
});
await chat.initialize();
await restore();
process.stdout.write(`OpenFactory channels listening on ${Object.keys(adapters).join(', ')}\n`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void chat.shutdown().then(() => process.exit(0));
  });
}
