import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vite-plus/test';
import { cachedRead } from './read-cache.server';
it('retains successful reads across offline calls but never hides denied access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'factory-cache-'));
  try {
    await cachedRead('machine-a', async () => ({ text: 'saved conversation' }), directory);
    const offline = () => Promise.reject(new Error('Cannot reach OpenFactory: ECONNREFUSED'));
    expect(await cachedRead('machine-a', offline, directory)).toMatchObject({
      offline: true,
      value: { text: 'saved conversation' },
    });
    await expect(cachedRead('machine-b', offline, directory)).rejects.toThrow('ECONNREFUSED');
    await expect(
      cachedRead(
        'machine-a',
        () => Promise.reject(new Error('HTTP 403: Access denied')),
        directory,
      ),
    ).rejects.toThrow('403');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
