# Direct agent runtime

OpenFactory owns agent definitions, timer dispatch, webhook verification, session IDs, run queues, transcripts, and execution status. It starts Codex or Claude directly. T3 Code is needed only to export existing agents during migration.

## Research

Sources were inspected on 29 October 2026 using btca-local. Local repositories are in `~/.btca/agent/sandbox`.

- [T3's native thread CLI](https://github.com/pingdotgg/t3code/blob/6d450a428/apps/server/src/cli/thread.ts) connects to a running T3 server and fails when none is running. It avoids T3 scheduling, but retains the server dependency.
- [The separate t3code CLI](https://github.com/MajesteitBart/t3code-cli/tree/c2961b156fb7d05531ebab1b7647cbdde9c41fef) launches threads with `orchestration.launchThread`. Its README explicitly requires a running local T3 server. It is useful for T3 handovers, but cannot provide independent execution.
- [T3's Codex adapter](https://github.com/pingdotgg/t3code/blob/6d450a428/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts) uses Codex's app-server protocol. OpenFactory uses the smaller supported CLI surface for background runs; it does not reproduce T3's orchestrator or inject T3 tools.
- [Official Codex non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode) specifies `codex exec --json` and `codex exec resume <session-id>`. Events provide a native session ID, assistant messages, completion/failure, and token usage. Installed Codex CLI 0.165.0 confirmed these flags.
- [Official Claude headless documentation](https://code.claude.com/docs/en/headless) specifies `claude -p --output-format stream-json --verbose`, stdin prompts, and `--resume <session-id>`. Result events carry completion or failure. OpenFactory retains normal CLI authentication and project configuration discovery.

A T3 CLI backend was considered, but it would leave installation, authentication, and execution tied to T3. Direct provider CLIs satisfy independent ownership with fewer runtime dependencies. The CLI adapter is separate from scheduling and storage so richer provider protocols can be added without changing trigger ownership.

## Modules

`packages/runtime` builds a standalone Node service. It has no third-party runtime installation step after bundling and no T3 client.

- `contracts.ts` validates runtime commands and persisted domain values.
- `store.ts` stores projects, agents, sessions, runs, messages, webhook credentials, deliveries, request receipts, and imported archives in SQLite.
- `schedule.ts` calculates the next interval or host-local fixed time.
- `providers.ts` builds argument arrays, spawns the selected CLI without a shell, parses JSON events, and interrupts its process group.
- `runtime.ts` claims due triggers and commits their run and next due time in one transaction. It persists follow-up queues and resumes each session by its native ID.
- `server.ts` owns a private Unix socket and process lock. `cli.ts` exposes operator commands.
- The web server uses `runtime-rpc.ts`. Paired desktop connections forward the same runtime methods through their authenticated transport.

Manual, timer, and webhook runs create new provider sessions. Follow-ups queue on the selected session. One agent executes one turn at a time, even across different sessions. Different agents may execute concurrently; choose a worktree strategy when they need isolated checkouts.

## State and restarts

The default directory is `~/.config/openfactory/runtime`. Set `OPENFACTORY_RUNTIME_DIR` to move it. The directory has owner-only permissions. SQLite uses WAL and transactions; raw provider events are retained in `events/<run-id>.jsonl`.

Request receipts deduplicate manual runs and follow-ups. Webhooks accept `Idempotency-Key`; keep the same key and payload when retrying. A reused key with different rendered instructions is rejected. Timer claims include the agent ID and due timestamp. After downtime, an overdue timer runs once and advances to a future time, without replaying every missed interval.

On restart, running turns become interrupted and are not automatically retried, because they may already have changed files or called external tools. Queued turns remain durable. Stopping a conversation also cancels its queued turns. Provider sessions and transcripts remain available on the host; the run page shows a terminal resume command.

Codex's [`turn.completed` usage is cumulative for the native thread](https://github.com/openai/codex/blob/9def09afa71e1443a1028866ac22dc82aedea00e/codex-rs/exec/src/event_processor_with_jsonl_output.rs). OpenFactory persists the previous counters and records their difference for each owned turn. The real resume test was cross-checked against `last_token_usage` in Codex's transcript. Turns run separately in a terminal are not imported into OpenFactory's normalized transcript; keep ownership of an active session with one caller at a time.

Run success means that the provider emitted a successful terminal event and exited successfully. It no longer means only that dispatch succeeded. Captured usage is shown directly; missing prices are reported as unpriced rather than invented.

## Webhooks

OpenFactory serves `POST /api/webhooks/<agent-id>/<token>` through the web application. `OPENFACTORY_PUBLIC_URL` on the runtime service determines the advertised origin. Private Tailscale HTTPS is supported; arbitrary public exposure requires the operator's normal network/authentication setup.

Each agent gets a random URL token. Optional signatures use HMAC-SHA256 over the raw body, with the header, prefix, and hex/base64 encoding declared in `schedule.signature`. Set the signing secret from a private file with `pnpm openfactory webhook-secret <agent-id> <file>`. A signature configuration without a secret rejects deliveries. Requests are limited to 1 MB, use JSON bodies, and reject paused agents. Templates such as `{{body.event}}` are expanded before queueing.

Migrated webhook URLs change because the endpoint belongs to OpenFactory. Update webhook senders to the endpoint shown in agent settings. Existing signing secrets cannot be exported from T3 and must be configured again.

## Migration and rollback

Run `pnpm runtime:migrate` to save a private snapshot without changing schedules. Then run `pnpm runtime:migrate --apply` while the OpenFactory runtime is running.

The script validates and imports projects, agents, and text history before changing T3. Imported agents start paused. It then pauses every old T3 schedule, checks that old conversations have no active turns, and enables the previously enabled agents in OpenFactory with their original next due times. The snapshot and resumable cutover receipt are under `runtime/migration-t3`.

Re-running a completed migration preserves later edits and pause decisions. If a cutover fails partway, rerun it: the receipt records which steps finished. Historical T3 conversations remain read-only archives. New turns start direct provider sessions; they do not pretend that an old T3 thread ID is a native provider session ID. T3-hosted binary attachments remain in T3; text history is retained locally.

For rollback, pause the imported agents in OpenFactory first. Use the private snapshot to restore only the T3 agents that were previously enabled. Do not run both owners simultaneously. Keep the snapshot and the original T3 state until the replacement has been verified.

## Verification

The runtime tests start fixture CLI processes and verify output persistence, native-session resume, failed turns, queue cancellation, provider selection, durable trigger claims, request deduplication, and signed webhook dispatch. They use isolated temporary SQLite databases and do not call model APIs.

An authenticated webhook-to-Codex run and native-session follow-up were also executed with T3 configured to an unreachable address. The webhook returned 202, a retry reused its run ID, and both turns completed in the same native session. An authenticated Codex smoke run was also executed through the standalone daemon with T3 absent from its launch path. It completed with the exact requested response, a native session ID, and token usage. Claude CLI was unavailable on this host; its adapter was verified with subprocess fixtures, not an authenticated Claude run.
