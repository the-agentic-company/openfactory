import { connectionPreferences, localNativeConnection } from './native-runtime.server';
import { runtimeRead } from './runtime-rpc';
import { runtimeResults } from '@openfactory/runtime/rpc';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { readComputerWorkspace } from './computer-workspaces.server';
import { factoryOverviewInputSchema, readFactoryOverview } from '@openfactory/client';
import { runtimeRpc as callRuntime } from '@openfactory/runtime/client';

export const getComputerFactoryOverview = createServerFn({ method: 'GET' })
  .validator(factoryOverviewInputSchema.extend({ computerId: z.string() }))
  .handler(async ({ data }) => {
    const preferences = await connectionPreferences();
    const target =
      data.computerId === 'local'
        ? await localNativeConnection()
        : preferences.computers.find((entry) => entry.id === data.computerId);
    if (!target) {
      throw new Error('Computer is no longer paired. Refresh Settings.');
    }
    return readFactoryOverview(data, (method, payload) => callRuntime(method, payload, target));
  });

export const getComputerWorkspace = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => readComputerWorkspace(data.id));

export const getComputerAgentHistory = createServerFn({ method: 'GET' })
  .validator(z.object({ computerId: z.string(), id: z.string() }))
  .handler(async ({ data }) => {
    const preferences = await connectionPreferences();
    const target =
      data.computerId === 'local'
        ? await localNativeConnection()
        : preferences.computers.find((entry) => entry.id === data.computerId);
    if (!target) {
      throw new Error('Machine is no longer paired.');
    }
    return runtimeResults['history.agent'].parse(
      (await runtimeRead('history.agent', { id: data.id }, target)).value,
    );
  });
