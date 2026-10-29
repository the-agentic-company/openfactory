import { mkdir, writeFile, rename } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  connectionPreferences,
  connectionPreferencesPath,
  localNativeConnection,
  nativeRequest,
  nativeState,
} from './native-runtime.server';

const execute = promisify(execFile);
export const enableNetwork = createServerFn({ method: 'POST' }).handler(async () => {
  const connection = await localNativeConnection();
  const result = await execute('tailscale', ['status', '--json'], { timeout: 10000 });
  const status = z
    .object({ BackendState: z.string(), Self: z.object({ DNSName: z.string() }) })
    .parse(JSON.parse(result.stdout));
  if (status.BackendState !== 'Running') {
    throw new Error('Connect this computer to Tailscale, then try again.');
  }
  const dnsName = status.Self.DNSName.replace(/\.$/, '');
  const existing: unknown = JSON.parse(
    (await execute('tailscale', ['serve', 'status', '--json'], { timeout: 10000 })).stdout,
  );
  const mapping = z
    .object({
      TCP: z.record(z.string(), z.unknown()).optional(),
      Web: z
        .record(
          z.string(),
          z.object({ Handlers: z.record(z.string(), z.object({ Proxy: z.string().optional() })) }),
        )
        .optional(),
    })
    .parse(existing);
  if (
    mapping.TCP?.['8445'] &&
    mapping.Web?.[`${dnsName}:8445`]?.Handlers['/']?.Proxy !== connection.origin
  ) {
    throw new Error(
      'Tailscale port 8445 belongs to another service. Free that port before enabling OpenFactory access.',
    );
  }
  await execute('tailscale', ['serve', '--bg', '--https=8445', connection.origin], {
    timeout: 15000,
  });
  const address = `https://${dnsName}:8445`;
  await nativeRequest(connection, '/v1/network', 'POST', { address });
  return { address };
});
async function savePreferences(value: Awaited<ReturnType<typeof connectionPreferences>>) {
  const path = connectionPreferencesPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
const addressSchema = z.url().transform((value) => {
  const url = new URL(value);
  if (
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !(
      (url.protocol === 'https:' && url.hostname.endsWith('.ts.net')) ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
  ) {
    throw new Error('Use a private Tailscale HTTPS address.');
  }
  return url.origin;
});
export const getConnections = createServerFn({ method: 'GET' }).handler(async () => {
  const preferences = await connectionPreferences();
  let local = null;
  try {
    local = await nativeState(await localNativeConnection());
  } catch {
    // The web app can still manage remote connections while its local host is stopped.
  }
  return {
    activeId: preferences.activeId ?? 'local',
    computers: [
      { id: 'local', name: 'This computer', local: true, origin: local?.address ?? null },
      ...preferences.computers.map(({ id, name, origin }) => ({ id, name, origin, local: false })),
    ],
    local,
  };
});
export const selectComputer = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const preferences = await connectionPreferences();
    if (data.id !== 'local' && !preferences.computers.some((computer) => computer.id === data.id)) {
      throw new Error('Choose a saved computer.');
    }
    const target =
      data.id === 'local'
        ? await localNativeConnection()
        : preferences.computers.find((computer) => computer.id === data.id);
    if (!target) {
      throw new Error('Computer not found.');
    }
    await nativeState(target);
    preferences.activeId = data.id;
    await savePreferences(preferences);
    return { selected: data.id };
  });
export const pairComputer = createServerFn({ method: 'POST' })
  .validator(z.object({ address: addressSchema, code: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const grant = z
      .object({ host: z.object({ id: z.string(), name: z.string() }), token: z.string() })
      .parse(
        await nativeRequest({ origin: data.address, token: '' }, '/v1/pair', 'POST', {
          name: hostname(),
          code: data.code,
        }),
      );
    const preferences = await connectionPreferences();
    const computer = {
      id: grant.host.id,
      name: grant.host.name,
      origin: data.address,
      token: grant.token,
    };
    preferences.computers = [
      ...preferences.computers.filter((entry) => entry.id !== computer.id),
      computer,
    ];
    await savePreferences(preferences);
    return { id: computer.id };
  });
export const forgetComputer = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const preferences = await connectionPreferences();
    preferences.computers = preferences.computers.filter((entry) => entry.id !== data.id);
    if (preferences.activeId === data.id) {
      preferences.activeId = null;
    }
    await savePreferences(preferences);
    return { forgotten: true };
  });
export const createPairing = createServerFn({ method: 'POST' }).handler(async () => {
  const result = z
    .object({ id: z.string(), code: z.string(), expiresAt: z.number(), origin: z.string() })
    .parse(await nativeRequest(await localNativeConnection(), '/v1/pairing', 'POST', {}));
  const url = new URL('openfactory://pair');
  url.searchParams.set('address', result.origin);
  url.hash = result.code;
  return { ...result, link: url.href };
});
export const cancelPairing = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) =>
    z
      .object({ ok: z.boolean() })
      .parse(await nativeRequest(await localNativeConnection(), '/v1/pairing', 'DELETE', data)),
  );
export const revokeComputer = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) =>
    z
      .object({ ok: z.boolean() })
      .parse(await nativeRequest(await localNativeConnection(), `/v1/peers/${data.id}`, 'DELETE')),
  );
