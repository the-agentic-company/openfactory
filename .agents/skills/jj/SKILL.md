---
name: jj
description: 'Apply Baptiste''s preferred Jujutsu workflow: multiple agents edit disjoint code in the current shared folder, then their work becomes separate or stacked PRs without branch or worktree ceremony. Use whenever Baptiste says "use jj" or asks to turn colocated work into multiple PRs.'
---

# Baptiste's jj workflow

Baptiste wants one working directory. Do not propose separate worktrees or ask him to manage branches.

Multiple agents may edit the current folder at the same time when their scopes do not overlap. Give each agent clear path ownership. Each agent packages and publishes its own scope when finished; there is no coordinator.

```text
                  pr/auth
                 /       \
trunk() --------<         >-------- @  current folder with everything
                 \       /
                  pr/search
```

```bash
bun run jj:publish \
  --bookmark pr/session/auth \
  --message "feat(auth): outcome" \
  -- path/to/auth

gh pr create --base main --head pr/session/auth
```

Use the repository's `scripts/jj-publish.ts` command rather than assembling a publishing script. It takes the shared `.jj/agent-publish.lock`, preserves edits during stale-workspace recovery, pins stable change and commit IDs, packages only the selected paths onto `trunk()`, and checks that exact revision before pushing. It preserves unrelated edits and excludes unrelated ancestor changes from the PR. Requires JJ 0.45.1 or later, plus `lockf` on macOS or `flock` on Linux.

Use `--package-only` to inspect the packaged revision without checking or pushing. After a check failure, fix the published change using its recorded change ID, then run `bun run jj:publish --bookmark pr/session/auth --resume`. Resume still enforces the original paths and base, and checks the bookmark's exact current revision. Recovery backups, if recovery fails, are retained under `.jj/agent-publish/recovery-*` with a manifest.

The command runs Lefthook through `jj run` in its isolated reusable checkout. Keep `pre-push` aligned with useful local CI checks, including formatting, linting, type checks, architecture checks, and tests. After creating a PR, attach its URL to this chat. To track a merged PR, use `bun run release:status --pr NUMBER --follow`; see `docs/runbooks/release.md`.

If changes overlap, split them interactively. For a stacked PR, pass `--base pr/session/dependency` and use that bookmark as the PR base.
