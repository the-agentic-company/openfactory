# OpenFactory

A local agent dashboard on top of T3 Code. The grid reads every scheduled task in the connected T3 environment. T3 owns scheduling, models, tools, execution, and persistence; OpenFactory provides the interface.

## Start

Use Node 26 and pnpm 12.15.0. Keep T3 Code running.

```sh
pnpm install
mkdir -p ~/.config/openfactory
chmod 700 ~/.config/openfactory
t3 auth session issue --scope orchestration:read --scope orchestration:operate \
  --ttl 30d --label 'OpenFactory local dashboard' --token-only \
  > ~/.config/openfactory/t3-token
chmod 600 ~/.config/openfactory/t3-token
pnpm dev
```

Open http://localhost:8018 on the server, or http://dell-server.taild717d7.ts.net:8018 from another device connected to Tailscale. Development binds to `0.0.0.0:8018` by default and allows the Dell's Tailscale hostname, including hot reload. This also makes it reachable on the host's LAN interfaces. The app uses your local T3 identity and has no multi-user authentication, so use trusted networks. Credentials remain in the Node server and are never sent to the browser. The example token expires after 30 days; rerun the issue command to reconnect. Revoke it through `t3 auth session list` and `t3 auth session revoke <session-id>`.

Set `T3_ORIGIN` for another T3 server (default `http://127.0.0.1:3773`). Set `T3_TOKEN_FILE` for another token path or `T3_TOKEN` via a secret manager. These are server environment variables; Vite also loads an ignored `apps/web/.env.local` during development. See [.env.example](.env.example).

## Features

- Live agent grid with 10-second refresh, search, schedule/webhook/paused filters.
- Real run-now and pause/resume controls using T3's authenticated WebSocket API.
- Model, instructions, next trigger, last dispatch, and dispatch count for each agent.
- Agent details link to bound conversations and show recent webhook delivery outcomes.
- New agents support intervals, daily host-local times, and webhooks. They start paused and inherit the selected agent's project, model options, tools, and permission mode. New schedules run in a fresh T3 conversation. At least one existing T3 schedule is required to supply runtime settings.
- Clear connection errors; no demo data or local shadow scheduler.

T3's `lastRunStatus: succeeded` means **dispatch succeeded**, not that the model finished successfully. Run counts and activity are scheduler dispatch information; the grid is not a complete execution history. Bound conversations contain execution results. Webhook delivery history is fetched from T3. Timer schedules use the T3 host timezone. Timers require the T3 host to run; webhook URLs require T3 Connect remote access. An unsigned webhook is authenticated by its URL token; treat that URL as private.

## Integration

The Node adapter connects to `/ws?orchestrationProtocol=2` with a scoped bearer token and Effect RPC JSON frames. Calls are limited by the server functions to `scheduledTasks.list`, `.runNow`, `.setEnabled`, `.upsert`, and `.listWebhookDeliveries`. Responses pass Zod validation before entering the UI. This was verified against the installed T3 Code 0.1.2; its protocol is internal and may need updating when T3 changes.

Source references inspected with btca-local:

- [Schedule contracts](https://github.com/pingdotgg/t3code/blob/main/packages/contracts/src/scheduledTask.ts)
- [RPC contracts](https://github.com/pingdotgg/t3code/blob/main/packages/contracts/src/rpc.ts)
- [WebSocket server](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/ws.ts)

## Validation and build

```sh
pnpm check
pnpm test
pnpm build
# Stop dev first; keep production local too.
HOST=127.0.0.1 PORT=8018 pnpm --filter @openfactory/web start
```

The React/TanStack Start app is in `apps/web`; domain validation is in `packages/core/src/agents.ts`. The original starter's unused package and database examples remain available for future work. No database connection is needed by this dashboard.

## Migrated reliability agents

The two Mibba reliability loops now use OpenFactory's T3 scheduler and one shared T3 coordinator conversation. They retain GPT-6.1 Sol with medium reasoning and the canonical state in `/home/baptiste/git/mibba-reliability`. The operator runs every six hours; the digest retains its existing daily 09:00 Europe/Paris trigger.

The original Codex desktop automations are paused, with backups and a cutover receipt in `~/.config/openfactory/migrations/codex-reliability-2026-10-26`. They are retained as history and rollback evidence. OpenFactory no longer reads Codex's local databases or uses its app-tools socket. The Codex desktop app is not required for these agents; T3 Code remains the scheduler and model runtime host.

## Assistant and previous runs

Open an agent to see **Runs & assistant**. The run list shows actual execution status and saved user/assistant messages. Two schedules sharing a coordinator keep their task-tagged runs separate; unassigned coordinator turns are labeled separately. Live chat uses [assistant-ui's external-store runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store) with T3 as the message store and agent backend. Sends have idempotency keys and queue behind active work. Historical transcripts are read-only; switch to Live assistant to continue the conversation.

A one-time export preserved the latest 20 operator turns and all 18 digest turns from the original Codex conversations. These archives are private files under `~/.config/openfactory/history`, independent of the Codex desktop app. Older operator turns remain in the original Codex history. The browser shows only user/assistant text; system messages and raw tool payloads are excluded. Live history inspects up to 30 matching conversations and the latest 100 live messages, and reports when that view is limited.

## Always-on service

The Dell deployment now runs through `openfactory.service` on loopback port 8019, behind the persistent private Tailscale Serve route on HTTPS port 8444. It restarts on failure and starts at boot through the existing lingering user session. `openfactory-token.timer` checks daily and renews the scoped, thirty-day T3 credential weekly using an atomic file replacement.

```sh
pnpm build
./scripts/install-service.sh
systemctl --user status openfactory.service
journalctl --user -u openfactory.service -n 50
systemctl --user restart openfactory.service
```

The supplied service units assume this checkout is at `~/git/openfactory`. Server environment overrides belong in `~/.config/openfactory/service.env`. After code changes, rebuild and restart the service. Do not run a second production process on port 8019.

T3's native `t3code.service` is installed and enabled. Its OpenFactory drop-in waits for the current desktop-owned listener on port 3773 to exit, then starts the persistent T3 server, preserving current desktop sessions during installation. The drop-in template is `deployment/systemd/t3code-openfactory.conf`; copy it to `~/.config/systemd/user/t3code.service.d/openfactory.conf` after `t3 service install` on another host. User lingering and the Tailscale system service must be enabled on that host. Access requires the Dell server to be powered on and the viewing device connected to the tailnet.

### YAML team demo

Open `/teams` to explore the reliability team blueprint in [`teams/reliability.yaml`](teams/reliability.yaml). The file defines the project and working directory, one lead, reporting lines, each agent's prompt/model, and manual, delegated, interval, or daily triggers.

Select a node to inspect its definition. In **YAML**, edit the source and choose **Update chart**. The parser validates the complete file and rejects unknown managers, reporting cycles, duplicate IDs, invalid triggers, and malformed YAML. The last valid chart remains available if an edit is invalid. **Download YAML** exports the editor contents; **Reset demo** restores the repository version. Applied drafts persist only in this browser, not on the server. Save the downloaded file over `teams/reliability.yaml` and rebuild to change the checked-in demo.

This is a team-design demo. Its coordinator and specialists are illustrative. It does not provision agents, alter the two live reliability schedules, delegate work, or execute prompts. The live-agent workspace remains at `/`.

## Factory workspaces

Each T3 project appears under **Factories**, including projects without scheduled agents. Switch between **Dashboard**, **Activity**, **Agents**, **Runs**, and **Scorers** while keeping the selected factory. Views have shareable URLs such as `/?project=%2Fhome%2Fbaptiste%2Fgit%2Fmibba&view=runs`. Mobile uses a factory selector and horizontal page navigation.

Agent cards show a name and description. Click a card to open its full page at `/agents/<agent-id>`, with runs, assistant, schedule controls, settings, and a searchable Lucide icon picker with an Emoji tab. Choices persist on the OpenFactory host under `~/.config/openfactory/workspace/appearances`, separately from T3 schedules. Creating an agent inside a factory binds it to that project, even when its model and permissions are inherited from another project's runtime.

Dashboard, Activity, and Runs use actual T3 execution records, including ordinary project conversations. History prioritizes conversations bound to scheduled agents, then the newest project conversations, up to 30 conversations and 300 runs. A run inspector shows the request excerpt and saved assistant output. These pages refresh every 30 seconds. Cost and token metrics are unavailable through the current connection.

Scorers are saved output rules: required text, excluded text, or minimum character length. They evaluate completed runs with available assistant responses and do not launch models. Text rules ignore case, and length counts visible Unicode characters. Output over 50,000 characters is excluded from scoring because the inspector retains only the final 50,000 characters. Definitions persist under `~/.config/openfactory/workspace/scorers`; set `OPENFACTORY_SETTINGS_DIR` to relocate both settings directories. The Scorers page supports creation, results with run evidence, and deletion.

## Factory as code documentation

Open **Documentation** in the sidebar or visit `/docs`. The Fumadocs MDX page starts from Warp’s MIT-licensed factory definition reference, with attribution and a separate OpenFactory compatibility section. Its source is `apps/web/content/docs/index.mdx`.

Each live agent has a **Definition** tab with an `agent.md` viewer, download, and editor. The YAML frontmatter supports `description` (the agent name), `agentType: CUSTOM`, and `harness.model`. The Markdown body holds the instructions. Save applies the definition to the existing T3 task while preserving the schedule, provider options, permissions, and conversation binding. Unsupported configuration produces a validation error. If the name, model, or instructions changed since the editor opened, reload the definition before saving.

Open **Factory definition** in a factory workspace to browse `factory.yaml` and all saved agent files. The editor has a searchable file tree, YAML and Markdown highlighting, line numbers, validation, and an unsaved-changes guard. Saving an agent file applies it to its existing T3 task. Saving `factory.yaml` stores configuration only; shared execution defaults are not applied to T3.

Native files persist as versioned snapshots under `~/.config/openfactory/workspace/definitions` (or `OPENFACTORY_SETTINGS_DIR/definitions`). The page shows the active snapshot’s location. Atomic snapshot publication preserves the previous files if validation or a runtime update fails. Stale revision checks prevent one editor from overwriting another editor’s saved changes. Existing bindings keep file paths stable when agents are renamed. New T3 agents are added to the tree when it reloads.

Downloaded files remain snapshots. OpenFactory does not watch disk edits, provision agents from factory files, import automations, or create Git branches.

## Run browser

The Runs view uses compact rows with status icons, source badges, referenced PRs, relative timestamps, search, and status filters. Click a row to open `/runs/<run-id>?thread=<conversation-id>&project=<factory-path>`.

A run page shows its recorded conversation beside Timeline, Agents, Scores, Artifacts, and Metadata tabs. Artifacts include links and attachments from that run's messages. PRs are labeled as references; a link alone does not establish merge status. PNG, JPEG, WebP, and GIF attachments up to 5 MB have previews and an image viewer. OpenFactory checks that each image belongs to the selected run before fetching it through T3's asset API. The browser receives image bytes, not the T3 credential or signed asset URL.

The follow-up composer sends to the same conversation and queues behind active work. When T3 exposes the new run immediately, OpenFactory opens it. Otherwise, the page confirms the queued message and links to the conversation.

The production service runs an immutable copy under `~/.local/share/openfactory/current`, independently of the checkout’s build directory. To publish an updated build, run `pnpm build` followed by `./scripts/deploy-service.sh`. The staging script verifies the copy before atomically switching the release pointer. Builds used during development cannot remove assets from the running release. Previous releases remain under `~/.local/share/openfactory/releases`.
