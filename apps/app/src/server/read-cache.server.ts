import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const recordSchema = z.object({ savedAt: z.string(), value: z.unknown() });
export async function cachedRead(
  key: string,
  read: () => Promise<unknown>,
  directory = process.env.OPENFACTORY_READ_CACHE ?? join(homedir(), '.cache/openfactory/reads'),
) {
  const path = join(directory, `${createHash('sha256').update(key).digest('hex')}.json`);
  try {
    const value = await read();
    const savedAt = new Date().toISOString();
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ savedAt, value }), { mode: 0o600 });
      await rename(temporary, path);
    } catch {
      /* A cache failure must not block a live read. */
    }
    return { value, offline: false, savedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !/Cannot reach|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|timed out|Timeout|fetch failed|socket|ENOENT/i.test(
        message,
      ) ||
      /HTTP 40[13]/.test(message)
    ) {
      throw error;
    }
    try {
      const saved = recordSchema.parse(JSON.parse(await readFile(path, 'utf8')));
      return { ...saved, offline: true };
    } catch {
      throw error;
    }
  }
}
