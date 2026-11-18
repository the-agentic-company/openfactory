import { createSlackAdapter } from '@chat-adapter/slack';
import type { Platform } from './index';

/**
 * Slack over Socket Mode: the host opens an outbound websocket, so no public
 * URL, tunnel or signing secret is needed. Create the app from
 * `packages/channels/slack-manifest.yaml`.
 */
export const slack: Platform = {
  name: 'slack',
  env: [
    { key: 'SLACK_BOT_TOKEN', description: 'Bot User OAuth Token (xoxb-…)' },
    { key: 'SLACK_APP_TOKEN', description: 'App-level token with connections:write (xapp-…)' },
  ],
  create: () =>
    createSlackAdapter({
      mode: 'socket',
      botToken: process.env.SLACK_BOT_TOKEN,
      appToken: process.env.SLACK_APP_TOKEN,
    }),
};
