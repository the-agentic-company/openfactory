import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { agentAppearanceSchema, scorerSchema, type AgentAppearance } from '@openfactory/core';
import { factoryProfileSchema, type FactoryProfile } from '../factory-profile';
import { z } from 'zod';
import { nativeConnection, nativeRequest } from './native-runtime.server';

async function remoteSettings(data: unknown) {
  const target = await nativeConnection();
  return target
    ? { value: await nativeRequest(target, '/v1/workspace-settings', 'POST', data) }
    : null;
}

function normalizeLegacyAppearance(appearance: AgentAppearance): AgentAppearance {
  if (appearance.kind !== 'icon' || appearance.color !== undefined) {
    return appearance;
  }
  const name =
    appearance.name === 'code'
      ? 'code-2'
      : appearance.name === 'shield'
        ? 'shield-check'
        : appearance.name;
  return { ...appearance, name };
}
const storedAppearanceSchema = agentAppearanceSchema.transform(normalizeLegacyAppearance);

const storedFactoryProfileSchema = factoryProfileSchema
  .extend({
    icon: z.union([
      storedAppearanceSchema,
      z.string().transform((name) => normalizeLegacyAppearance({ kind: 'icon', name })),
    ]),
  })
  .pipe(factoryProfileSchema);

const root = () =>
  process.env.OPENFACTORY_SETTINGS_DIR ?? join(homedir(), '.config/openfactory/workspace');
function appearancePath(id: string) {
  return join(root(), 'appearances', `${createHash('sha256').update(id).digest('hex')}.json`);
}
async function readOptional(path: string) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
async function save(path: string, data: unknown) {
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
  await rename(temporary, path);
}
export async function readAppearances(ids: string[]) {
  if (!ids.length) {
    return {};
  }
  const remote = await remoteSettings({ operation: 'read', section: 'appearances', ids });
  if (remote) {
    return z.record(z.string(), storedAppearanceSchema).parse(remote.value);
  }
  const appearances: Record<string, AgentAppearance> = {};
  await Promise.all(
    ids.map(async (id) => {
      const raw = await readOptional(appearancePath(id));
      if (raw) {
        appearances[id] = storedAppearanceSchema.parse(JSON.parse(raw));
      }
    }),
  );
  return appearances;
}
export const writeAppearance = async (id: string, appearance: AgentAppearance) => {
  if (await remoteSettings({ operation: 'write', section: 'appearances', id, value: appearance })) {
    return;
  }
  await save(appearancePath(id), appearance);
};
function factoryProfilePath(id: string) {
  return join(root(), 'factories', `${createHash('sha256').update(id).digest('hex')}.json`);
}
export async function readFactoryProfiles(ids: string[]) {
  if (!ids.length) {
    return {};
  }
  const remote = await remoteSettings({ operation: 'read', section: 'factories', ids });
  if (remote) {
    return z.record(z.string(), storedFactoryProfileSchema).parse(remote.value);
  }
  const profiles: Record<string, FactoryProfile> = {};
  await Promise.all(
    ids.map(async (id) => {
      const raw = await readOptional(factoryProfilePath(id));
      if (raw) {
        profiles[id] = storedFactoryProfileSchema.parse(JSON.parse(raw));
      }
    }),
  );
  return profiles;
}
export const writeFactoryProfile = async (id: string, profile: FactoryProfile) => {
  const value = factoryProfileSchema.parse(profile);
  if (await remoteSettings({ operation: 'write', section: 'factories', id, value })) {
    return;
  }
  await save(factoryProfilePath(id), value);
};
export async function readScorers() {
  const remote = await remoteSettings({ operation: 'read', section: 'scorers' });
  if (remote) {
    return z.array(scorerSchema).parse(remote.value);
  }
  const dir = join(root(), 'scorers');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json'));
  return Promise.all(
    files.map(async (file) =>
      scorerSchema.parse(JSON.parse(await readFile(join(dir, file), 'utf8'))),
    ),
  );
}
export const writeScorer = async (scorer: unknown) => {
  const parsed = scorerSchema.parse(scorer);
  if (
    await remoteSettings({ operation: 'write', section: 'scorers', id: parsed.id, value: parsed })
  ) {
    return;
  }
  return save(join(root(), 'scorers', `${parsed.id}.json`), parsed);
};
export const removeScorer = async (id: string) => {
  if (await remoteSettings({ operation: 'remove', section: 'scorers', id })) {
    return;
  }
  await unlink(join(root(), 'scorers', `${id}.json`));
};
