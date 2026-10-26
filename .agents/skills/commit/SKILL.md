---
name: commit
description: Create well-scoped Git commits while preserving unrelated work. Use when the user asks to commit, commit all, create a Git commit, or handle commit-time staging.
---

# Commit

- Do not commit unless the user explicitly asks.
- Inspect `git status --short` and the relevant diffs before staging.
- When the user says “commit,” include only the changes made for the current task. Preserve unrelated staged and unstaged work.
- When the user says “commit all,” include all current changes, splitting them into coherent commits when appropriate.
- Stage explicit paths with `git add -- <path...>`; do not use broad pathspecs such as `.` unless the user requested all changes and the full diff has been reviewed.
- Verify the staged patch with `git diff --staged` before committing. If the index already contains unrelated changes, avoid disturbing them and use a Git workflow that limits the commit to the intended paths.
- Use a concise, action-oriented commit message that describes the outcome.
- Never bypass Git hooks. If a hook fails, report or fix the failure within the task’s scope, then retry normally.
- After committing, inspect `git status --short` and report the commit hash and any remaining changes.
