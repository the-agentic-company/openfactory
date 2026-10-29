import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const valueSchema = z.object({ data: z.string() });
const tables = [
  'projects',
  'agents',
  'teams',
  'sessions',
  'runs',
  'messages',
  'deliveries',
  'receipts',
  'secrets',
  'archives',
] as const;
type Table = (typeof tables)[number];

export class Store {
  readonly db: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'runtime.sqlite'));
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    for (const table of tables) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
    }
  }
  get<S extends z.ZodType>(table: Table, id: string, schema: S): z.output<S> | null {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id);
    return row ? schema.parse(JSON.parse(valueSchema.parse(row).data)) : null;
  }
  all<S extends z.ZodType>(table: Table, schema: S): z.output<S>[] {
    return this.db
      .prepare(`SELECT data FROM ${table} ORDER BY rowid`)
      .all()
      .map((row) => schema.parse(JSON.parse(valueSchema.parse(row).data)));
  }
  put(table: Table, id: string, value: unknown) {
    this.db
      .prepare(
        `INSERT INTO ${table} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      )
      .run(id, JSON.stringify(value));
  }
  delete(table: Table, id: string) {
    this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  }
  deleteProject(id: string) {
    this.transaction(() => {
      const agents = "SELECT id FROM agents WHERE json_extract(data, '$.projectId') = ?";
      const runs = `SELECT id FROM runs WHERE json_extract(data, '$.agentId') IN (${agents})`;
      this.db
        .prepare(`DELETE FROM receipts WHERE json_extract(data, '$.runId') IN (${runs})`)
        .run(id);
      this.db
        .prepare(`DELETE FROM messages WHERE json_extract(data, '$.runId') IN (${runs})`)
        .run(id);
      this.db
        .prepare(`DELETE FROM deliveries WHERE json_extract(data, '$.agentId') IN (${agents})`)
        .run(id);
      this.db.prepare(`DELETE FROM secrets WHERE id IN (${agents})`).run(id);
      this.db
        .prepare(`DELETE FROM runs WHERE json_extract(data, '$.agentId') IN (${agents})`)
        .run(id);
      this.db
        .prepare("DELETE FROM sessions WHERE json_extract(data, '$.thread.projectId') = ?")
        .run(id);
      this.db
        .prepare("DELETE FROM archives WHERE json_extract(data, '$.thread.projectId') = ?")
        .run(id);
      this.db.prepare("DELETE FROM teams WHERE json_extract(data, '$.projectId') = ?").run(id);
      this.db.prepare("DELETE FROM agents WHERE json_extract(data, '$.projectId') = ?").run(id);
      this.delete('projects', id);
    });
  }
  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
