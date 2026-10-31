import { createRxDatabase, type RxCollection, type RxJsonSchema } from 'rxdb/plugins/core';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import type { AsyncStorage } from '@tanstack/query-persist-client-core';
import { pullRequestResultSchema } from '@openfactory/core';
import { z } from 'zod';

type CacheRecord = { id: string; value: string };
const schema: RxJsonSchema<CacheRecord> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: { id: { type: 'string', maxLength: 10000 }, value: { type: 'string' } },
  required: ['id', 'value'],
};
const savedQuerySchema = z.object({
  buster: z.string(),
  queryHash: z.string(),
  queryKey: z.array(z.unknown()),
  state: z.object({
    data: pullRequestResultSchema,
    dataUpdatedAt: z.number(),
    errorUpdatedAt: z.number(),
  }),
});

export async function openQueryStorage(name: string) {
  const database = await createRxDatabase<{ queries: RxCollection<CacheRecord> }>({
    name,
    storage: getRxStorageDexie(),
    multiInstance: true,
  });
  await database.addCollections({ queries: { schema } });
  const storage: AsyncStorage = {
    async getItem(id) {
      const document = await database.queries.findOne(id).exec();
      if (!document) {
        return null;
      }
      try {
        const saved = savedQuerySchema.parse(JSON.parse(document.value));
        if (!id.endsWith(saved.queryHash)) {
          throw new Error('Different query cache key.');
        }
        return document.value;
      } catch {
        await document.remove();
        return null;
      }
    },
    async setItem(id, value) {
      await database.queries.incrementalUpsert({ id, value });
    },
    async removeItem(id) {
      await database.queries.findOne(id).remove();
    },
  };
  return { storage, close: () => database.close() };
}

let current: ReturnType<typeof openQueryStorage> | undefined;
function browserStorage() {
  current ??= openQueryStorage('openfactory-query-cache-v1').catch((error: unknown) => {
    current = undefined;
    throw error;
  });
  return current;
}

export const queryStorage: AsyncStorage = {
  async getItem(key) {
    try {
      return await (await browserStorage()).storage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      await (await browserStorage()).storage.setItem(key, value);
    } catch {
      /* Network queries still work when browser storage is unavailable or full. */
    }
  },
  async removeItem(key) {
    try {
      await (await browserStorage()).storage.removeItem(key);
    } catch {
      /* Cache cleanup must not prevent a network request. */
    }
  },
};
