---
name: loops-worktree-setup
description: Create or resume a persistent Mibba loop worktree, start its environment, and verify authenticated website and real Assistant conversations. Use when preparing or checking a long-running agent checkout.
---

# Loops worktree setup

Prepare a durable environment for a long-running agent. Report separate source,
dependency, authenticated UI, Assistant and browser-QA readiness; a Vite banner,
provider catalog or HTTP response alone is not end-to-end readiness.

## Resolve and preserve

Read repository instructions, personal preferences, `docs/worktrees.md` and the
loop's operating policy. Resolve the exact requested checkout, backing repository,
target revision, state directory and expected browser context. Inspect Git worktrees,
Jujutsu state, existing services and ownership before creation. Reuse an owned
checkout without resetting or overwriting other work. Keep persistent memory and
its backing repository through ordinary disposable-worktree cleanup.

For a new caller-authorized path, create its parent directory and a Git worktree at
the configured revision. Lock it with a persistent-agent reason. Follow the project's
Jujutsu convention; Reliability uses a separate non-colocated JJ repository backed
by the main checkout's Git repository. Confirm `@-` matches the intended base before
editing. Do not adopt another checkout's `.jj` folder or register persistent memory
as disposable cleanup state. The policy, rather than this skill, names the path.

## Prepare and start

Use `DOCKER_CONTEXT=orbstack` and a PATH containing Bun and the configured AI runtime executable. For this host, prepend `/Users/baptiste/.bun/bin` and `/Users/baptiste/.opencode/bin`. Confirm executable discovery before launching. Run
`bun run worktree:doctor` first. Codex's environment hook normally prepares dependencies
and `.env`; only use `bun run worktree:bootstrap` when doctor reports missing setup.
Preserve an existing environment file. Never print credentials or copy provider
credentials into the repository.

Before local schema synchronization, read `docs/database.md`. Use the existing
`bun run dev:ui:start` launcher. It owns deterministic tmux startup, isolated services,
the local MCP, model availability, seeded test-user login and the exact case URL.
Reuse its checkout-owned server. Use `bun run dev` in tmux only if the required
verification actually needs services beyond that UI stack. Do not start Docker Desktop.

## Verify through the browser

Read [references/acceptance.md](references/acceptance.md) and complete its gates in
the existing Codex browser. Read the selected study and local/production data source
before navigation; preserve that context across tabs. Only the human selects or
confirms another context. Ask for that selection when needed and continue independent
checks. Never repair a mismatch through APIs, cookies, special URLs or a server restart.

Use `.env`'s `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` only if the normal local
login is necessary. Record evidence using
[templates/environment-check.md](templates/environment-check.md), stored in the
policy's private state directory. Save screenshots and console/server diagnostics
there, without raw credentials or customer content.

Finish only after the loaded dossier, real Assistant response, Mibba data question
and browser/server QA have evidence. Mark a failed or unavailable gate as a concrete
gap with the next action; do not turn partial readiness into a pass. Run the same
checks after an environment change or a previously failed gate, not on every code
review when the environment is already verified.
