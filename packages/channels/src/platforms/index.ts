import type { Adapter } from 'chat';
import { slack } from './slack';

/**
 * One messaging platform. Each lives in its own file and wraps a Chat SDK
 * adapter (`@chat-adapter/<name>`); the bridge stays platform-agnostic.
 * To add Discord, Telegram, Teams…: install the adapter, add a file like
 * `slack.ts`, and register it below.
 */
export interface Platform {
  /** Key used in `channels.json` and as the Chat SDK adapter name. */
  name: string;
  /** Environment variables the adapter needs. */
  env: { key: string; description: string }[];
  create(): Adapter;
}

export const platforms: Record<string, Platform> = { slack };

export function missingEnv(platform: Platform) {
  return platform.env.filter(({ key }) => !process.env[key]).map(({ key }) => key);
}
