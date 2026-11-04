# Persistent task-board agent

The agent definition is `factory/agents/task-board/agent.md`. It maintains its own HTML page and SQLite database. The initial page is `output.html` in this directory; `schema.sql` defines the task and activity tables. This example adapts Bap's persistent coworker app to OpenFactory's agent runtime and existing HTML renderer.

Start the OpenFactory runtime and app, then register this repository and initialize the agent:

```sh
pnpm runtime:build
pnpm openfactory project . OpenFactory
pnpm openfactory run openfactory-task-board
```

Open `/app/projects/openfactory/agents/task-board/app`. The adjacent **Database** tab lists the agent's tables and views in a read-only TanStack Table grid. It shows column types and primary keys, supports sorting and 50-row pages, and refreshes every 10 seconds. The viewer uses read-only SQLite connections and has no editing or SQL execution controls. The first run creates the tables, installs the page, and adds a next task if the board is empty. Later initialization runs preserve existing data and page edits. The agent uses a manual schedule; Run now works while its automatic schedule is disabled.

- Add a task or complete one to write to SQLite immediately.
- Prioritize tasks or Suggest the next task starts an agent run that edits the data.
- Change the layout starts a run that edits the existing HTML and logs the change in SQLite.
- Reload the app to see saved state. HTML updates appear automatically within a few seconds.

Every agent gets an app automatically. The runtime stores `output.html` and `data.sqlite` under its state directory in `agent-apps/<hash of factory and agent IDs>`. Renaming an agent or using another worktree keeps the same files. Agent instructions include their absolute paths and explain how to update both. Runtime data is separate from repository definitions and is retained when a definition is removed. Include the runtime state directory in backups, using SQLite's backup API for live databases.

The page runs inside the existing sandboxed visualization frame. It has no network or host access. Only the persistent App tab attaches database and agent bridges; ordinary chat visuals cannot use them. The host binds requests to the inspected agent and verifies their source frame. Agent prompts require interaction with the active page and are limited to six per minute. Database queries run in a separate process with a two-second timeout, atomic transactions, bounded JSON input/results, and a SQLite authorizer that rejects schema changes, file attachment, extensions, PRAGMAs, and transaction control. Pages may read and edit all tables in their agent's database. Agent runs retain their configured file permissions and can manage schema directly.

Both bridges use `parent.postMessage(message, '*')`. Replies repeat `version: 1` and the request's unique `requestId`. Validate `event.source === parent` when receiving them.

```js
parent.postMessage(
  {
    type: 'openfactory:database-query',
    version: 1,
    requestId: crypto.randomUUID(),
    statements: [{ sql: 'SELECT id,title FROM tasks LIMIT 100', args: [] }],
  },
  '*',
);
// Reply: openfactory:database-result with results: [{columns, rows, changes}], or error.

parent.postMessage(
  {
    type: 'openfactory:agent-prompt',
    version: 1,
    requestId: crypto.randomUUID(),
    prompt: 'Prioritize unfinished tasks. Update the database only.',
  },
  '*',
);
// Reply: openfactory:agent-prompt-result with status: 'sent' or 'rejected', and optional error.
```

Run the database/runtime tests and the live page check:

```sh
pnpm exec vp test packages/runtime/src/agent-apps.test.ts packages/runtime/src/runtime.test.ts
pnpm exec node scripts/verify-agent-app.mjs
# Also start a real agent run to verify HTML and database updates:
pnpm exec node scripts/verify-agent-app.mjs --agent
```

The live check requires the initialized example and app on port 8018. Set `OPENFACTORY_APP_URL` for another local app address and `CHROME_PATH` for another browser executable. It removes its temporary task and activity entries when finished. The `--agent` check deliberately toggles the saved compact layout.
