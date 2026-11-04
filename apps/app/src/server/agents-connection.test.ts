import { beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (handler: unknown) => handler,
    validator: () => ({ handler: (handler: unknown) => handler }),
  }),
}));
vi.mock('./native-runtime.server', () => ({ nativeConnection: vi.fn() }));
vi.mock('./runtime-rpc', () => ({ runtimeRpc: vi.fn(), runtimeRead: vi.fn() }));
vi.mock('./factory-store', () => ({
  readAppearances: vi.fn(async () => ({})),
  readFactoryProfiles: vi.fn(async () => ({})),
}));

import { getAgents } from './agents';
import { nativeConnection } from './native-runtime.server';
import { runtimeRpc, runtimeRead } from './runtime-rpc';

beforeEach(() => vi.resetAllMocks());

it('returns recovery instructions when the local connection file is missing', async () => {
  vi.mocked(nativeConnection).mockRejectedValue(new Error('ENOENT: connection.json'));
  const result = await getAgents();
  expect(result.connected).toBe(false);
  expect(result.error).toContain('Cannot connect to OpenFactory on this computer');
  expect(result.error).toContain('Start or restart');
  expect(runtimeRpc).not.toHaveBeenCalled();
});

it('explains denied remote access instead of reporting an unspecified outage', async () => {
  vi.mocked(nativeConnection).mockResolvedValue({ origin: 'https://host.ts.net', token: 'secret' });
  vi.mocked(runtimeRead).mockRejectedValue(new Error('HTTP 401: Invalid token secret'));
  const result = await getAgents();
  expect(result.connected).toBe(false);
  expect(result.error).toContain('Access to OpenFactory on the selected computer was denied');
  expect(result.error).toContain('pair again');
  expect(result.error).not.toContain('secret');
  expect(result.cacheScope).toBe('https://host.ts.net');
});
