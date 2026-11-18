# @openfactory/channels

Talk to OpenFactory agents from messaging platforms. Built on the
[Vercel Chat SDK](https://chat-sdk.dev) (`chat` + `@chat-adapter/*`).

Threads behave like Hermes's Slack gateway:

- **Channels**: the bot answers only when @mentioned, and replies in a thread on that message.
- **Threads**: once the bot is in a thread, it answers every new reply there without a
  mention, except replies that open by @-mentioning someone else.
- **DMs**: every message is answered.

Each chat thread is one OpenFactory session: the first message starts it (`agents.run` with
the message as `text`) and later ones continue it (`sessions.send`).

- The run's final assistant message is posted back in the thread. Failures are posted too.
- Chat thread → session links persist in `conversations.json`, so threads keep their
  session across restarts.

## Layout

```
src/
  platforms/        one file per platform, wrapping a Chat SDK adapter
    index.ts        registry (name, required env vars, create())
    slack.ts        Slack over Socket Mode
  bridge.ts         platform-agnostic: Chat SDK events → OpenFactory sessions
  agent-runtime.ts  the AgentRuntime port + its OpenFactory RPC implementation
  conversations.ts  chat thread → OpenFactory session store
  config.ts         channels.json / channels.env loading and routing
  cli.ts            `openfactory-channels serve`
```

To add a platform (Discord, Telegram, Teams…): `pnpm add @chat-adapter/<name>`, add
`src/platforms/<name>.ts` like `slack.ts`, register it in `platforms/index.ts`, and add a
`platforms.<name>` entry to `channels.json`. The bridge does not change.

## Configure

Files live in `~/.config/openfactory/channels` (override with `OPENFACTORY_CHANNELS_DIR`).

`channels.json` picks the answering agent per platform, with optional per-channel overrides:

```json
{
  "platforms": {
    "slack": { "agentId": "<agent id>", "channels": { "C0123ABC": "<agent id for that channel>" } }
  }
}
```

Use agents with `threadMode: "new"` so each chat thread gets its own session. The agent's
prompt is sent first, followed by `Request:` and the user's message.

Secrets come from the environment, or from `channels.env` next to `channels.json`:

| Platform | Variables                                                               |
| -------- | ----------------------------------------------------------------------- |
| Slack    | `SLACK_BOT_TOKEN` (xoxb-), `SLACK_APP_TOKEN` (xapp-, connections:write) |

Slack runs in Socket Mode: no public URL is needed, but while Socket Mode is on Slack stops
sending that app's events to its Request URL. Create a dedicated app from
[`slack-manifest.yaml`](slack-manifest.yaml), or reuse one whose HTTP events you can pause.
The app needs the `app_mention`, `message.im` and `message.channels` bot events (plus
`message.groups` for private channels). Without `message.channels`, Slack only delivers thread
replies that mention the bot.

## Run

The runtime must support `agents.run` with `text` (this repository's runtime).

```sh
pnpm --filter @openfactory/channels build
node packages/channels/dist/channels.mjs serve
```

`OPENFACTORY_RUNTIME_DIR` selects which runtime socket to talk to, as for the CLI.
