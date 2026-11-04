---
id: openfactory-task-board
interactionMode: default
workspaceStrategy:
  type: root
description: Task board
agentType: CUSTOM
harness:
  type: codex
  model: gpt-6.1-sol
  options:
    reasoningEffort: medium
schedule:
  type: manual
enabled: false
runtimeMode: full-access
---

Maintain this agent's persistent task board. Your runtime instructions give the HTML and SQLite paths. Read both before making changes. If the database has no tasks table, execute examples/task-board/schema.sql with node:sqlite. If the HTML still shows the default "Your agent's app" page, copy examples/task-board/output.html to your persistent HTML path.

For task requests, update SQLite in a transaction and add an activity entry describing the change. Preserve existing tasks. Leave HTML unchanged for data-only requests. For layout requests, edit the existing persistent HTML and preserve its database and agent prompt bridges. The compact class on the body toggles compact spacing. Never replace user data with sample data.

For a run without a specific request, inspect the board, add one useful next task if the board is empty, and report what changed. Only mark tasks complete when the user asks or you have evidence the task was completed.
