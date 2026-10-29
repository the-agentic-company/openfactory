---
name: open-factory
description: Create and configure OpenFactory factories, agents, schedules, and teams for a repository. Use when asked to build an agent factory or manage work through OpenFactory.
---

# Open Factory

Use OpenFactory to register a repository as a factory and run Codex or Claude Code agents on the runtime host. A factory is a project with an absolute working directory; agents own their prompts, provider settings, permissions, and triggers. Teams add shared guidance and reporting lines.

## Locate the installation

The skill may be symlinked into another repository. Resolve this skill directory's real path: the OpenFactory checkout is three directories above it (`.agents/skills/open-factory`). In this installation it is `/home/baptiste/git/openfactory`. Keep the target repository separate from the OpenFactory checkout.

Run CLI commands from OpenFactory, even when creating a factory for another repository:

```sh
factory_repo=/home/baptiste/git/openfactory
pnpm -C "$factory_repo" openfactory status
pnpm -C "$factory_repo" openfactory agents
```

Use the existing runtime when available. If setup is needed, read the checkout's `README.md` for installation and service commands. The runtime host needs the selected provider CLI installed and authenticated. The CLI uses the local Unix socket; a remote dashboard URL alone does not connect it to that host. `OPENFACTORY_RUNTIME_DIR` selects a non-default runtime state directory; preserve the intended installation's setting.

## Create a factory and its agents

1. Establish the target's absolute path, intended outcome, agent responsibilities, provider/model, permissions, and triggers from the request and repository instructions. For unspecified triggers, start with manual agents. Use an installed provider and an available model; the model in the example is illustrative.
2. Register the target repository. The CLI uses its resolved absolute path as the project ID:

   ```sh
   pnpm -C "$factory_repo" openfactory project /absolute/path/to/target 'Target factory'
   ```

3. Inspect `agents` before creating agents so a repeated request can reuse existing IDs. Write one JSON file per agent using the example below. Replace its path, model, title, and prompt with the actual choices. Agent instructions should state the outcome, relevant repository context, verification, and when to hand back to the user.
4. Apply the file and capture the returned `task.id`:

   ```sh
   pnpm -C "$factory_repo" openfactory create /absolute/path/to/agent.json
   ```

   To update an existing agent, include its actual `id` and all required fields. Omitting `id` creates a new agent. Re-read current settings before updating so unrelated settings survive.
5. Verify the saved agent with `agents`: project, prompt, model, permissions, workspace strategy, schedule, and enabled state must match the request. If teams are needed, follow [references/teams.md](references/teams.md).
6. When running work is in scope, start one manual run and inspect its session. Keep recurring triggers paused until their activation is requested. Report the factory path, agent IDs, settings, and what was actually verified.

### Agent creation JSON

```json
{
  "title": "Repository reviewer",
  "prompt": "Review the target repository's current changes. Follow its AGENTS.md. Report concrete defects with file references and validation evidence. Return findings for human review.",
  "projectId": "/absolute/path/to/target",
  "schedule": { "type": "manual" },
  "enabled": false,
  "modelSelection": { "instanceId": "codex", "model": "gpt-6.1-sol" },
  "runtimeMode": "approval-required",
  "interactionMode": "default",
  "workspaceStrategy": { "type": "root" }
}
```

Use the user's permission choice. `runtimeMode` accepts `approval-required`, `auto-accept-edits`, or `full-access`. `interactionMode` accepts `default` or `plan`. Providers are `codex`, `claude`, or `claude-code`.

`workspaceStrategy` can be `{"type":"root"}`, `{"type":"existing_worktree","worktreePath":"/absolute/path"}`, or `{"type":"worktree","baseRef":"HEAD"}`. Choose according to the target repository's workflow. Worktree sessions keep their checkout for follow-ups; root agents share the target directory.

### Triggers

- Manual: `{"type":"manual"}`. Manual runs work while the agent is paused.
- Interval: `{"type":"interval","everyMs":3600000}`. Minimum interval: 60,000 ms.
- Fixed time: `{"type":"fixed_time","timeOfDay":"09:00","weekdays":[1,2,3,4,5]}`. Sunday is `0`; omitting weekdays means every day. Times use the runtime host's timezone.
- Webhook: `{"type":"webhook"}`. Read the README's Webhooks section for public URL setup, optional signatures, and secret-file configuration. Obtain the actual endpoint from the agent settings; treat its URL token as a credential. Paused agents reject deliveries.

`resume <agent-id>` enables the configured trigger; `pause <agent-id>` disables it. Creating or saving an agent does not run it. Enabling a timer or webhook can start future work, so apply the requested activation state deliberately.

## Continuous improvement teams

For a team that owns ongoing improvement, put **hill climbing** in its shared guidance and each agent's prompt so it remains available on follow-up turns: establish a dated baseline, choose a metric and direction with guardrails and an evaluation window, test one bounded hypothesis, compare equivalent before/after cohorts, keep verified improvements and revert regressions, then record the result and next hypothesis. Treat missing data, low traffic, delayed effects and inconclusive measurements as unknown. Each run is bounded; later runs resume pending evaluations and the experiment history.

Give each subject a named owner and make the lead the user's chief of staff: it prioritizes experiments, assigns bounded work, reconciles existing ownership, accepts verified evidence, and returns one consolidated report. Reporting lines do not execute work. Put explicit `team-run` dispatch and session-readback instructions in the lead's prompt; manual specialists can remain paused and be dispatched by the lead. Separate specialist outputs and keep one writer for shared operational memory and overlapping implementation. Preserve existing schedules and approval holds; unspecified new triggers start manual.

## Run and inspect

```sh
pnpm -C "$factory_repo" openfactory run '<agent-id>'
pnpm -C "$factory_repo" openfactory read '<session-id>'
printf '%s' 'Continue with the next step.' | pnpm -C "$factory_repo" openfactory send '<session-id>' -
pnpm -C "$factory_repo" openfactory stop '<session-id>'
pnpm -C "$factory_repo" openfactory pause '<agent-id>'
pnpm -C "$factory_repo" openfactory resume '<agent-id>'
```

Capture IDs from command responses rather than guessing them. Dispatch success establishes that work was queued; inspect the transcript and terminal run status before reporting task success. Each agent executes one turn at a time, while different agents can run concurrently. Follow-ups queue behind active work and resume the saved provider session. Stop active OpenFactory work before taking over that native session in another terminal.

## Definitions and source of truth

The app's **Definition** tab edits an agent's Markdown frontmatter and instructions. **Factory definition** edits `<repository>/factory/factory.yaml`, agent files, and team files on the selected runtime host. Repository files are authoritative, and external edits are loaded by the runtime. Keep stable agent IDs in frontmatter to preserve history. Register an existing repository with `pnpm openfactory project /absolute/path/to/repository`. Preview the one-time move from global storage with `pnpm openfactory definitions-migrate`, then apply it with `--apply`. Reload stale files before saving.

Factory-wide defaults are stored configuration; set operational model, permissions, prompt, and schedule on each agent. The copied Warp reference describes additional features that OpenFactory does not execute, including Warp automation files, runners, and model routers. Use its **OpenFactory compatibility** section for supported behavior.

When an example is insufficient or the installation has changed, read these paths relative to the resolved OpenFactory checkout:

- `packages/runtime/src/cli.ts`: supported CLI commands and response routing.
- `packages/runtime/src/contracts.ts`: `upsertSchema`, provider settings, and workspace strategies.
- `packages/core/src/agents.ts`: schedule validation.
- `packages/core/src/agent-definition.ts`: applied agent frontmatter.
- `README.md`: setup, webhooks, runtime lifecycle, and persistence.
- `apps/web/content/docs/factory-definition.mdx`, **OpenFactory compatibility**: supported definition editing.

Keep provider credentials on the runtime host and secrets out of committed agent JSON and definitions.
