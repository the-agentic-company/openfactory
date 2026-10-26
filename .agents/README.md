# Imported skills

All 93 skill directories were copied from `~/git/mibba/.agents/skills`, including their scripts, references, agent metadata and executable permissions. The shared `setup-matt-pocock-skills` reference directory is included too. Their contents are preserved unchanged. `.claude/skills` points to this same collection. The source `skills-lock.json`, pstack license and installation notes retain upstream provenance. Obsidian workspace settings are editor state and are excluded.

## Use in OpenFactory

Invoke a skill by its name after the host refreshes its skill catalog. A new turn or session may be needed. Importing a skill installs its instructions and bundled resources; external CLIs, host-specific capabilities and project services remain prerequisites.

Resolve project commands against this repository's package manifests and Vite+ configuration. Use `pnpm` instead of Bun. Prefer `pnpm check`, `pnpm test`, `pnpm build` and `pnpm dev` where their purpose matches the imported workflow. The development server uses port 8018.

Mibba-specific paths, credentials, production services, release pipelines, database policies and operational worktrees describe the source project. They do not configure or authorize operations on Mibba from this project. For an OpenFactory task, use the local equivalent when present; report a missing prerequisite when there is none. In particular, `jj` publishing references `scripts/jj-publish.ts`, which OpenFactory does not have: use native `jj` commands to package only the task-owned paths. Telemetry, SLO, Septeo, demo refresh and reliability workflows require their project-specific setup before they can operate here.

Repository instructions, the current host's tool rules and explicit user choices govern the imported workflows. Preserve source copies when updating; adapt an individual skill when a concrete OpenFactory workflow needs it.
