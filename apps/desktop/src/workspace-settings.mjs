import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const section = z.enum(['appearances', 'factories', 'scorers']);
const id = z.string().min(1).max(4096);
const inputSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('read'), section, ids: z.array(id).max(1000).optional() }),
  z.object({ operation: z.literal('write'), section, id, value: z.json() }),
  z.object({ operation: z.literal('remove'), section, id }),
]);
export async function workspaceSettings(raw) {
  const input = inputSchema.parse(raw);
  const root = join(
    process.env.OPENFACTORY_SETTINGS_DIR ?? join(homedir(), '.config/openfactory/workspace'),
    input.section,
  );
  const filename = (id) =>
    input.section === 'scorers'
      ? `${z.uuid().parse(id)}.json`
      : `${createHash('sha256').update(id).digest('hex')}.json`;
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (input.operation === 'read') {
    if (input.section === 'scorers') {
      const files = (await readdir(root)).filter((file) => /^[a-f0-9-]+\.json$/.test(file));
      return Promise.all(
        files.map(async (file) => JSON.parse(await readFile(join(root, file), 'utf8'))),
      );
    }
    const values = new Map();
    for (const id of input.ids ?? []) {
      try {
        values.set(id, JSON.parse(await readFile(join(root, filename(id)), 'utf8')));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
    return Object.fromEntries(values);
  }
  if (!input.id) {
    throw new Error('Choose a settings record.');
  }
  const path = join(root, filename(input.id));
  if (input.operation === 'remove') {
    await unlink(path);
    return { ok: true };
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(input.value), { mode: 0o600 });
  await rename(temporary, path);
  return { ok: true };
}
