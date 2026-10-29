import { z } from 'zod';
import { agentSchema, factorySchema, runSchema, stateSchema } from './contracts.mjs';

const metadataSchema = stateSchema.omit({ factories: true, agents: true, runs: true, peers: true });
const payloadSchemas = {
  host: metadataSchema,
  factory: factorySchema,
  agent: agentSchema,
  run: runSchema,
  peer: stateSchema.shape.peers.element,
};
export const syncKinds = Object.keys(payloadSchemas);
export const syncDocumentSchema = z.object({
  id: z.string().max(200),
  hostId: z.uuid(),
  kind: z.enum(syncKinds),
  data: z.string(),
  _deleted: z.boolean(),
});
export const syncCheckpointSchema = z.object({
  hostId: z.uuid(),
  sequence: z.number().int().nonnegative(),
});
export const syncPullInputSchema = z.object({
  checkpoint: syncCheckpointSchema.nullable(),
  batchSize: z.number().int().min(1).max(100),
});
export const syncBatchSchema = z.object({
  documents: z.array(syncDocumentSchema),
  checkpoint: syncCheckpointSchema,
});

export function validateSyncBatch(raw, hostId) {
  const batch = syncBatchSchema.parse(raw);
  if (batch.checkpoint.hostId !== hostId) {
    throw new Error('This address belongs to a different computer. Pair it again.');
  }
  for (const document of batch.documents) {
    const prefix = `${hostId}:${document.kind}:`;
    if (
      document.hostId !== hostId ||
      !document.id.startsWith(prefix) ||
      !z.uuid().safeParse(document.id.slice(prefix.length)).success
    ) {
      throw new Error('The host returned data belonging to a different computer.');
    }
    if (!document._deleted) {
      const payload = payloadSchemas[document.kind].parse(JSON.parse(document.data));
      const entityId = document.kind === 'host' ? payload.host.id : payload.id;
      if (document.id !== `${prefix}${entityId}`) {
        throw new Error('The host returned a record with a different identity.');
      }
    }
  }
  return batch;
}

export function snapshotDocuments(snapshot) {
  const { factories, agents, runs, peers, ...metadata } = stateSchema.parse(snapshot);
  return Object.entries({
    host: [metadata],
    factory: factories,
    agent: agents,
    run: runs,
    peer: peers,
  }).flatMap(([kind, rows]) =>
    rows.map((row) => ({
      id: `${snapshot.host.id}:${kind}:${kind === 'host' ? row.host.id : row.id}`,
      hostId: snapshot.host.id,
      kind,
      data: JSON.stringify(row),
      _deleted: false,
    })),
  );
}

export function documentsSnapshot(documents) {
  const rows = Object.fromEntries(syncKinds.map((kind) => [kind, []]));
  for (const document of documents) {
    if (!document._deleted) {
      rows[document.kind].push(payloadSchemas[document.kind].parse(JSON.parse(document.data)));
    }
  }
  if (!rows.host.length) {
    return null;
  }
  return stateSchema.parse({
    ...rows.host[0],
    factories: rows.factory,
    agents: rows.agent,
    runs: rows.run.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    peers: rows.peer,
  });
}
