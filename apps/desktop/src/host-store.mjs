import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { persistedHostSchema } from './contracts.mjs';
import { snapshotDocuments } from './sync-contracts.mjs';

const entityKinds = ['factories', 'agents', 'runs', 'peers'];

export function openHostStore(dataDir, initialState) {
  const path = join(dataDir, 'host.sqlite');
  const database = new DatabaseSync(path);
  try {
    chmodSync(path, 0o600);
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS host_metadata (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS host_records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (kind, id));
      CREATE TABLE IF NOT EXISTS sync_documents (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        host_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        data TEXT NOT NULL,
        deleted INTEGER NOT NULL
      );
    `);
    const metadata = database.prepare('SELECT data FROM host_metadata WHERE id = 1').get();
    let state;
    if (metadata) {
      state = JSON.parse(metadata.data);
      for (const kind of entityKinds) {
        state[kind] = database
          .prepare('SELECT data FROM host_records WHERE kind = ? ORDER BY rowid')
          .all(kind)
          .map((row) => JSON.parse(row.data));
      }
    } else {
      const legacyPath = join(dataDir, 'host.json');
      state = existsSync(legacyPath) ? JSON.parse(readFileSync(legacyPath, 'utf8')) : initialState;
    }
    state = persistedHostSchema.parse(state);

    const save = (nextState, snapshot) => {
      const parsed = persistedHostSchema.parse(nextState);
      const { factories, agents, runs, peers, ...nextMetadata } = parsed;
      const entities = { factories, agents, runs, peers };
      const previous = new Map(
        database
          .prepare('SELECT kind, id, data FROM host_records')
          .all()
          .map((row) => [JSON.stringify([row.kind, row.id]), row]),
      );
      const previousPublic = new Map(
        database
          .prepare('SELECT * FROM sync_documents')
          .all()
          .map((row) => [row.id, row]),
      );
      const documents = snapshotDocuments(snapshot);
      let changed = false;
      database.exec('BEGIN IMMEDIATE');
      try {
        database
          .prepare(
            'INSERT INTO host_metadata VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
          )
          .run(JSON.stringify(nextMetadata));
        for (const kind of entityKinds) {
          for (const entity of entities[kind]) {
            const data = JSON.stringify(entity);
            const key = JSON.stringify([kind, entity.id]);
            if (previous.get(key)?.data !== data) {
              database
                .prepare(
                  'INSERT INTO host_records VALUES (?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data',
                )
                .run(kind, entity.id, data);
            }
            previous.delete(key);
          }
        }
        for (const row of previous.values()) {
          database
            .prepare('DELETE FROM host_records WHERE kind = ? AND id = ?')
            .run(row.kind, row.id);
        }
        const writeDocument = (document, deleted) => {
          database.prepare('DELETE FROM sync_documents WHERE id = ?').run(document.id);
          database
            .prepare(
              'INSERT INTO sync_documents (id, host_id, kind, data, deleted) VALUES (?, ?, ?, ?, ?)',
            )
            .run(document.id, document.hostId, document.kind, document.data, deleted);
          changed = true;
        };
        for (const document of documents) {
          const old = previousPublic.get(document.id);
          if (!old || old.deleted || old.data !== document.data) {
            writeDocument(document, 0);
          }
          previousPublic.delete(document.id);
        }
        for (const old of previousPublic.values()) {
          if (!old.deleted) {
            writeDocument({ ...old, hostId: old.host_id, data: '' }, 1);
          }
        }
        database.exec('COMMIT');
        return changed;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    };
    return {
      state,
      save,
      pull(sequence, limit) {
        const documents = database
          .prepare('SELECT * FROM sync_documents WHERE sequence > ? ORDER BY sequence LIMIT ?')
          .all(sequence, limit);
        return {
          documents: documents.map((row) => ({
            id: row.id,
            hostId: row.host_id,
            kind: row.kind,
            data: row.data,
            _deleted: Boolean(row.deleted),
          })),
          checkpoint: { hostId: state.id, sequence: documents.at(-1)?.sequence ?? sequence },
        };
      },
      close: () => database.close(),
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
