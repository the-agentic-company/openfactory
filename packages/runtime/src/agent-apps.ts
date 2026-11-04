import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { runtimeInputs, runtimeResults } from './rpc-contracts';

const starter = `<h1>Your agent's app</h1><p>Ask your agent to build a page here. Its page and database persist across runs.</p>`;
const queryProcessScript = `
process.once('message', request => {
const { DatabaseSync, constants: c } = require('node:sqlite');
const db = new DatabaseSync(request.path, { timeout: 1000, enableDoubleQuotedStringLiterals: false, readOnly: request.readOnly });
try {
  db.exec('PRAGMA hard_heap_limit = 67108864; PRAGMA temp_store = MEMORY;');
  db.exec(request.readOnly ? 'PRAGMA query_only = ON; BEGIN' : 'PRAGMA max_page_count = 16384; BEGIN IMMEDIATE');
  const allowed = new Set([c.SQLITE_SELECT,c.SQLITE_READ,c.SQLITE_INSERT,c.SQLITE_UPDATE,c.SQLITE_DELETE,c.SQLITE_FUNCTION,c.SQLITE_RECURSIVE]);
  db.setAuthorizer((action, a, b, database) => {
    if (request.readOnly && [c.SQLITE_INSERT,c.SQLITE_UPDATE,c.SQLITE_DELETE].includes(action)) return c.SQLITE_DENY;
    if (request.readOnly && action === c.SQLITE_PRAGMA && a === 'table_xinfo') return c.SQLITE_OK;
    if (database && database !== 'main') return c.SQLITE_DENY;
    if (action === c.SQLITE_FUNCTION && ['load_extension','readfile','writefile','edit','eval'].includes((b || a || '').toLowerCase())) return c.SQLITE_DENY;
    if ([c.SQLITE_INSERT,c.SQLITE_UPDATE,c.SQLITE_DELETE].includes(action) && a.startsWith('sqlite_')) return c.SQLITE_DENY;
    return allowed.has(action) ? c.SQLITE_OK : c.SQLITE_DENY;
  });
  let bytes = 0;
  const results = request.statements.map(({sql,args}) => {
    const statement = db.prepare(sql);
    if (sql.slice(statement.sourceSQL.length).trim()) throw new Error('Use one SQL statement per entry.');
    statement.setReadBigInts(true);
    const columns = statement.columns().map(column => column.name);
    const before = db.prepare('SELECT total_changes() AS n').get().n;
    statement.setReturnArrays(true);
    const rows = [];
    for (const row of statement.iterate(...args)) {
      if (rows.length >= 500) throw new Error('Query exceeds 500 rows. Add a LIMIT.');
      const values = row.map(value => {
        if (typeof value === 'bigint') {
          const number = Number(value);
          return Number.isSafeInteger(number) ? number : String(value);
        }
        if (value instanceof Uint8Array) { if (request.readOnly) return '[BLOB: ' + value.byteLength + ' bytes]'; throw new Error('Binary values are not supported.'); }
        return value;
      });
      bytes += Buffer.byteLength(JSON.stringify(values));
      if (bytes > 1000000) throw new Error('Query results exceed 1 MB.');
      rows.push(values);
    }
    return { columns, rows, changes: Number(db.prepare('SELECT total_changes() AS n').get().n - before) };
  });
  if (Buffer.byteLength(JSON.stringify({results})) > 1000000) throw new Error('Query results exceed 1 MB.');
  db.setAuthorizer(null);
  db.exec('COMMIT');
  process.send({ results });
} catch (error) {
  process.send({ error: error.message });
} finally { db.close(); process.disconnect(); }
});
`;

export class AgentApps {
  private busy = new Set<string>();
  constructor(private readonly directory: string) {}
  ensure(agent: { id: string; projectId: string }) {
    const key = createHash('sha256')
      .update(JSON.stringify([agent.projectId, agent.id]))
      .digest('hex');
    const directory = join(this.directory, 'agent-apps', key);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const htmlPath = join(directory, 'output.html');
    const databasePath = join(directory, 'data.sqlite');
    if (!existsSync(htmlPath)) {
      writeFileSync(htmlPath, starter, { flag: 'wx', mode: 0o600 });
    }
    if (!existsSync(databasePath)) {
      const db = new DatabaseSync(databasePath);
      try {
        db.exec('PRAGMA journal_mode = WAL;');
      } finally {
        db.close();
      }
    }
    return { directory, htmlPath, databasePath };
  }
  read(agent: { id: string; projectId: string }) {
    const paths = this.ensure(agent);
    if (statSync(paths.htmlPath).size > 1_000_000) {
      throw new Error('Agent app exceeds the 1 MB HTML limit. Ask the agent to reduce its size.');
    }
    const html = readFileSync(paths.htmlPath, 'utf8');
    return { html, revision: createHash('sha256').update(html).digest('hex') };
  }
  async tables(agent: { id: string; projectId: string }) {
    const result = await this.query(
      agent,
      {
        id: agent.id,
        statements: [
          {
            sql: "SELECT name,type FROM sqlite_schema WHERE type IN ('table','view') AND substr(name,1,7) != 'sqlite_' ORDER BY name LIMIT 500",
            args: [],
          },
        ],
      },
      'read-only',
    );
    const rows = z
      .array(z.tuple([z.string(), z.enum(['table', 'view'])]))
      .parse(result.results[0]?.rows);
    return { tables: rows.map(([name, kind]) => ({ name, kind })) };
  }
  async rows(agent: { id: string; projectId: string }, input: unknown) {
    const data = runtimeInputs['database.rows'].parse(input);
    const catalog = await this.tables(agent);
    if (!catalog.tables.some((table) => table.name === data.table)) {
      throw new Error('This table no longer exists. Refresh the table list.');
    }
    const metadata = await this.query(
      agent,
      {
        id: agent.id,
        statements: [
          {
            sql: 'SELECT name,type,pk FROM pragma_table_xinfo(?) WHERE hidden != 1 ORDER BY cid LIMIT 500',
            args: [data.table],
          },
        ],
      },
      'read-only',
    );
    const fields = z
      .array(z.tuple([z.string(), z.string(), z.number()]))
      .parse(metadata.results[0]?.rows);
    const columns = fields.map(([name, type, pk]) => ({ name, type, primaryKey: pk > 0 }));
    const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
    if (data.sort && !columns.some((column) => column.name === data.sort?.column)) {
      throw new Error('This column no longer exists. Refresh the table.');
    }
    const primary = fields.filter((field) => field[2] > 0).sort((a, b) => a[2] - b[2]);
    const order = data.sort
      ? `${quote(data.sort.column)} ${data.sort.direction === 'desc' ? 'DESC' : 'ASC'}`
      : (primary.length
          ? primary.map((field) => field[0])
          : columns.slice(0, 1).map((column) => column.name)
        )
          .map(quote)
          .join(',');
    const result = await this.query(
      agent,
      {
        id: agent.id,
        statements: [
          { sql: `SELECT count(*) FROM ${quote(data.table)}`, args: [] },
          {
            sql: `SELECT * FROM ${quote(data.table)}${order ? ' ORDER BY ' + order : ''} LIMIT ? OFFSET ?`,
            args: [data.limit, data.offset],
          },
        ],
      },
      'read-only',
    );
    const total = z.number().int().nonnegative().parse(result.results[0]?.rows[0]?.[0]);
    return runtimeResults['database.rows'].parse({ columns, total, rows: result.results[1]?.rows });
  }

  async query(
    agent: { id: string; projectId: string },
    input: unknown,
    mode: 'read-write' | 'read-only' = 'read-write',
  ) {
    const { statements } = runtimeInputs['apps.query'].parse(input);
    if (Buffer.byteLength(JSON.stringify(statements)) > 1_000_000) {
      throw new Error('Query request exceeds 1 MB.');
    }
    const { databasePath } = this.ensure(agent);
    if (mode === 'read-write') {
      if (this.busy.has(databasePath)) {
        throw new Error('This database is busy. Retry in a moment.');
      }
      this.busy.add(databasePath);
    }
    try {
      return await new Promise<ReturnType<(typeof runtimeResults)['apps.query']['parse']>>(
        (resolve, reject) => {
          const child = spawn(
            process.execPath,
            ['--max-old-space-size=64', '--input-type=commonjs', '-e', queryProcessScript],
            {
              stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
            },
          );
          let timedOut = false;
          let response: unknown;
          const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, 2000);
          child.once('message', (message: unknown) => {
            response = message;
          });
          child.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
          });
          child.once('exit', () => {
            clearTimeout(timer);
            if (timedOut) {
              reject(new Error('Query exceeded the two second limit.'));
              return;
            }
            const result = runtimeResults['apps.query'].safeParse(response);
            if (result.success) {
              resolve(result.data);
            } else {
              reject(
                new Error(
                  typeof response === 'object' && response && 'error' in response
                    ? String(response.error)
                    : 'Database query process stopped.',
                ),
              );
            }
          });
          child.send({ path: databasePath, statements, readOnly: mode === 'read-only' });
        },
      );
    } finally {
      if (mode === 'read-write') {
        this.busy.delete(databasePath);
      }
    }
  }
}

export function agentAppInstructions(paths: ReturnType<AgentApps['ensure']>) {
  return `\n\nThis agent owns a persistent HTML app and SQLite database.\nHTML file: ${JSON.stringify(paths.htmlPath)}\nSQLite file: ${JSON.stringify(paths.databasePath)}\nThese paths persist across runs and worktrees. Read the existing files before editing. Update data without changing HTML for data-only requests. Edit the same HTML file for UI requests. Keep HTML self-contained; use the app theme CSS variables described above. Never store credentials in HTML or the shared database. Use node:sqlite DatabaseSync to create and migrate your schema and query data, with parameterized SQL and transactions. The page can read and write existing tables but cannot create or alter schema.\nThe page communicates through parent.postMessage, with no network access. Send {type:'openfactory:database-query',version:1,requestId,statements:[{sql,args:[]}]} and listen for {type:'openfactory:database-result',version:1,requestId,results:[{columns,rows,changes}]} or an error string. Queries are atomic, limited to 50 statements, 500 rows per statement, 1 MB of results and two seconds.\nButtons can ask you to act: send {type:'openfactory:agent-prompt',version:1,requestId,prompt}. Listen for {type:'openfactory:agent-prompt-result',version:1,requestId,status:'sent'|'rejected',error?}. Send prompts only on real user clicks. The host accepts requests only while the user is interacting with the app, with a rate limit of six per minute. Validate event.source === parent on replies. Use unique request IDs, timeouts and visible errors. Poll data every few seconds; the host reloads the page when the HTML changes.\n`;
}
