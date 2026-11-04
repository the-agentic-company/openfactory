import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vite-plus/test';
import { AgentApps } from './agent-apps';

const directories: string[] = [];
function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'of-app-'));
  directories.push(directory);
  const apps = new AgentApps(directory);
  const agent = { id: 'agent', projectId: 'project' };
  const paths = apps.ensure(agent);
  const db = new DatabaseSync(paths.databasePath);
  db.exec(
    "CREATE TABLE tasks(id INTEGER PRIMARY KEY, title TEXT); INSERT INTO tasks(title) VALUES ('First task')",
  );
  db.close();
  return { apps, agent, directory, paths };
}
afterEach(() => {
  for (const path of directories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});
it('persists editable data and HTML independently across instances and isolates agent databases', async () => {
  const { apps, agent, directory, paths } = setup();
  const html = '<h1>My persistent board</h1>';
  writeFileSync(paths.htmlPath, html);
  await apps.query(agent, {
    id: agent.id,
    statements: [{ sql: 'INSERT INTO tasks(title) VALUES (?)', args: ['Second task'] }],
  });
  const restarted = new AgentApps(directory);
  expect(restarted.read(agent).html).toBe(html);
  expect(
    (
      await restarted.query(agent, {
        id: agent.id,
        statements: [{ sql: 'SELECT title FROM tasks ORDER BY id', args: [] }],
      })
    ).results[0]?.rows,
  ).toEqual([['First task'], ['Second task']]);
  await expect(
    apps.query(
      { ...agent, id: 'other' },
      { id: 'other', statements: [{ sql: 'SELECT * FROM tasks', args: [] }] },
    ),
  ).rejects.toThrow('no such table');
});
it('rolls back the entire request when any statement fails', async () => {
  const { apps, agent } = setup();
  await expect(
    apps.query(agent, {
      id: agent.id,
      statements: [
        { sql: 'DELETE FROM tasks', args: [] },
        { sql: 'SELECT * FROM missing', args: [] },
      ],
    }),
  ).rejects.toThrow();
  expect(
    (
      await apps.query(agent, {
        id: agent.id,
        statements: [{ sql: 'SELECT count(*) FROM tasks', args: [] }],
      })
    ).results[0]?.rows,
  ).toEqual([[1]]);
});
it.each([
  "ATTACH DATABASE ':memory:' AS other",
  'PRAGMA database_list',
  'DROP TABLE tasks',
  'CREATE TABLE new_table(id)',
  'BEGIN',
  "SELECT load_extension('anything')",
  "UPDATE sqlite_master SET sql = 'bad'",
])('denies unsafe page SQL: %s', async (sql) => {
  const { apps, agent } = setup();
  await expect(
    apps.query(agent, { id: agent.id, statements: [{ sql, args: [] }] }),
  ).rejects.toThrow();
});
it('bounds rows and execution time, then accepts later queries', async () => {
  const { apps, agent } = setup();
  await expect(
    apps.query(agent, {
      id: agent.id,
      statements: [
        {
          sql: 'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<501) SELECT * FROM n',
          args: [],
        },
      ],
    }),
  ).rejects.toThrow('500 rows');
  await expect(
    apps.query(agent, {
      id: agent.id,
      statements: [
        {
          sql: 'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n) SELECT sum(x) FROM n',
          args: [],
        },
      ],
    }),
  ).rejects.toThrow('two second');
  expect(
    (await apps.query(agent, { id: agent.id, statements: [{ sql: 'SELECT 1', args: [] }] }))
      .results[0]?.rows,
  ).toEqual([[1]]);
});

it('rejects extra statements instead of silently ignoring them', async () => {
  const { apps, agent } = setup();
  await expect(
    apps.query(agent, {
      id: agent.id,
      statements: [{ sql: 'DELETE FROM tasks; SELECT 1', args: [] }],
    }),
  ).rejects.toThrow('one SQL statement');
  expect(
    (
      await apps.query(agent, {
        id: agent.id,
        statements: [{ sql: 'SELECT count(*) FROM tasks', args: [] }],
      })
    ).results[0]?.rows,
  ).toEqual([[1]]);
});

it('browses tables, schema and paginated rows through read-only access', async () => {
  const { apps, agent, paths } = setup();
  const db = new DatabaseSync(paths.databasePath);
  db.exec(
    "CREATE VIEW task_titles AS SELECT title FROM tasks; INSERT INTO tasks(title) VALUES ('Zebra'), ('Alpha'); CREATE TABLE empty_table(value TEXT)",
  );
  db.close();
  expect(await apps.tables(agent)).toEqual({
    tables: [
      { name: 'empty_table', kind: 'table' },
      { name: 'task_titles', kind: 'view' },
      { name: 'tasks', kind: 'table' },
    ],
  });
  const first = await apps.rows(agent, { id: agent.id, table: 'tasks', limit: 2, offset: 0 });
  expect(first).toEqual({
    columns: [
      { name: 'id', type: 'INTEGER', primaryKey: true },
      { name: 'title', type: 'TEXT', primaryKey: false },
    ],
    rows: [
      [1, 'First task'],
      [2, 'Zebra'],
    ],
    total: 3,
  });
  expect(
    (await apps.rows(agent, { id: agent.id, table: 'tasks', limit: 2, offset: 2 })).rows,
  ).toEqual([[3, 'Alpha']]);
  expect(
    (
      await apps.rows(agent, {
        id: agent.id,
        table: 'tasks',
        sort: { column: 'title', direction: 'asc' },
      })
    ).rows,
  ).toEqual([
    [3, 'Alpha'],
    [1, 'First task'],
    [2, 'Zebra'],
  ]);
  expect((await apps.rows(agent, { id: agent.id, table: 'empty_table' })).rows).toEqual([]);
  expect((await apps.rows(agent, { id: agent.id, table: 'task_titles' })).total).toBe(3);
});
it('quotes unusual names and rejects unknown tables and columns', async () => {
  const { apps, agent, paths } = setup();
  const db = new DatabaseSync(paths.databasePath);
  db.exec(
    'CREATE TABLE "odd"";name" ("select" TEXT); INSERT INTO "odd"";name" VALUES (\'literal value\')',
  );
  db.close();
  expect(
    (
      await apps.rows(agent, {
        id: agent.id,
        table: 'odd";name',
        sort: { column: 'select', direction: 'desc' },
      })
    ).rows,
  ).toEqual([['literal value']]);
  await expect(
    apps.rows(agent, { id: agent.id, table: 'tasks; DROP TABLE tasks' }),
  ).rejects.toThrow('no longer exists');
  await expect(
    apps.rows(agent, {
      id: agent.id,
      table: 'tasks',
      sort: { column: 'missing', direction: 'asc' },
    }),
  ).rejects.toThrow('column no longer exists');
  expect((await apps.tables({ ...agent, id: 'other' })).tables).toEqual([]);
});
it('enforces read-only queries and displays blobs and nulls', async () => {
  const { apps, agent, paths } = setup();
  await expect(
    apps.query(
      agent,
      { id: agent.id, statements: [{ sql: 'DELETE FROM tasks', args: [] }] },
      'read-only',
    ),
  ).rejects.toThrow();
  const db = new DatabaseSync(paths.databasePath);
  db.exec(
    "CREATE TABLE binary_values(data BLOB, missing TEXT); INSERT INTO binary_values VALUES (x'010203',NULL)",
  );
  db.close();
  expect((await apps.rows(agent, { id: agent.id, table: 'binary_values' })).rows).toEqual([
    ['[BLOB: 3 bytes]', null],
  ]);
  expect((await apps.rows(agent, { id: agent.id, table: 'tasks' })).total).toBe(1);
});
