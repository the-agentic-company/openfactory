import { expect, it } from 'vite-plus/test';
import { runPathParams, routeReference } from '../run-path';

export const threadId =
  'thread:project:588b77ef-ea36-4c08-b724-b8bb7d6d4eac:7f8b1966-378b-4551-a832-a34fe2a60751';
export const runId = `run:thread:${encodeURIComponent(threadId)}:ordinal:38`;

it('turns migrated composite identifiers into readable URL segments', () => {
  expect(runPathParams({ project: 'mibba', threadId, id: runId })).toEqual({
    project: 'mibba',
    thread: '7f8b1966-378b-4551-a832-a34fe2a60751',
    runId: '38',
  });
});

it('preserves native identifiers and rejects unsupported identifiers without an encoding fallback', () => {
  for (const id of ['run-1', '7f8b1966-378b-4551-a832-a34fe2a60751']) {
    expect(routeReference(id)).toBe(id);
  }
  for (const id of ['a:b', 'a/b', 'a?b#c', 'a%b', '~6162', '.', '..', '你好', 'a b']) {
    expect(() => routeReference(id)).toThrow('Unsupported run or conversation identifier.');
  }
});
