import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Which OpenFactory agent answers on each platform.
 *
 * ```json
 * {
 *   "platforms": {
 *     "slack": { "agentId": "<default agent>", "channels": { "C0123ABC": "<agent for #ops>" } }
 *   }
 * }
 * ```
 *
 * Secrets stay in the environment (see each platform's `env`), never in this file.
 */
export const platformRouteSchema = z.object({
  /** Answers mentions, direct messages and followed threads unless a channel overrides it. */
  agentId: z.string().min(1),
  /** Native channel id → agent id. */
  channels: z.record(z.string(), z.string().min(1)).default({}),
});
export const channelsConfigSchema = z.object({
  platforms: z.record(z.string(), platformRouteSchema).default({}),
});
export type PlatformRoute = z.infer<typeof platformRouteSchema>;
export type ChannelsConfig = z.infer<typeof channelsConfigSchema>;

export function channelsDirectory() {
  return process.env.OPENFACTORY_CHANNELS_DIR ?? join(homedir(), '.config/openfactory/channels');
}

export function loadChannelsConfig(directory = channelsDirectory()): ChannelsConfig {
  const path = join(directory, 'channels.json');
  if (!existsSync(path)) {
    throw new Error(`Create ${path} to choose which agent answers on each platform.`);
  }
  return channelsConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** Loads `channels.env` (KEY=value lines) without overriding variables already set. */
export function loadChannelsEnv(directory = channelsDirectory()) {
  const path = join(directory, 'channels.env');
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

/** Resolves the agent for a native channel id such as `C0123ABC`. */
export function agentFor(route: PlatformRoute, channel: string) {
  return route.channels[channel] ?? route.agentId;
}
