import { createRxDatabase } from 'rxdb/plugins/core';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { Subject } from 'rxjs';
import { documentsSnapshot, syncKinds, validateSyncBatch } from '../sync-contracts.mjs';

const schema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 200 },
    hostId: { type: 'string', maxLength: 36 },
    kind: { type: 'string', enum: syncKinds, maxLength: 20 },
    data: { type: 'string' },
  },
  required: ['id', 'hostId', 'kind', 'data'],
  indexes: ['hostId'],
};

export async function openClientCache({
  name = 'openfactory-cache-v1',
  storage = getRxStorageDexie(),
} = {}) {
  const database = await createRxDatabase({ name, storage, multiInstance: true });
  await database.addCollections({ records: { schema } });
  const replications = new Map();
  let closed = false;
  return {
    async snapshot(hostId) {
      const documents = await database.records.find({ selector: { hostId } }).exec();
      return documentsSnapshot(documents.map((document) => document.toJSON()));
    },
    observe(hostId, callback) {
      return database.records.find({ selector: { hostId } }).$.subscribe((documents) => {
        callback(documentsSnapshot(documents.map((document) => document.toJSON())));
      });
    },
    replicate(hostId, pull, onError, onHealthy = () => {}) {
      if (replications.has(hostId)) {
        return replications.get(hostId).replication;
      }
      const stream = new Subject();
      const replication = replicateRxCollection({
        collection: database.records,
        replicationIdentifier: `openfactory:${hostId}:v1`,
        live: true,
        retryTime: 2000,
        pull: {
          batchSize: 100,
          async handler(checkpoint, batchSize) {
            const batch = validateSyncBatch(await pull(checkpoint ?? null, batchSize), hostId);
            onHealthy();
            return batch;
          },
          stream$: stream.asObservable(),
        },
      });
      const errorSubscription = replication.error$.subscribe(onError);
      replications.set(hostId, { replication, stream, errorSubscription });
      return replication;
    },
    resync(hostId) {
      replications.get(hostId)?.stream.next('RESYNC');
    },
    async forget(hostId) {
      const entry = replications.get(hostId);
      if (entry) {
        await entry.replication.remove();
        entry.errorSubscription.unsubscribe();
        entry.stream.complete();
        replications.delete(hostId);
      }
      await database.records.find({ selector: { hostId } }).remove();
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      for (const entry of replications.values()) {
        await entry.replication.cancel();
        entry.errorSubscription.unsubscribe();
        entry.stream.complete();
      }
      await database.close();
    },
  };
}
