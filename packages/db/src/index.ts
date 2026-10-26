import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema: { projects } }), close: () => pool.end() };
}
