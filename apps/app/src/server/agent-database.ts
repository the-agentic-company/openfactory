import { createServerFn } from '@tanstack/react-start';
import { runtimeInputs, runtimeResults } from '@openfactory/runtime/rpc';
import { runtimeRpc } from './runtime-rpc';

export const listAgentTables = createServerFn({ method: 'GET' })
  .validator(runtimeInputs['database.tables'])
  .handler(async ({ data }) =>
    runtimeResults['database.tables'].parse(await runtimeRpc('database.tables', data)),
  );
export const readAgentTable = createServerFn({ method: 'GET' })
  .validator(runtimeInputs['database.rows'])
  .handler(async ({ data }) =>
    runtimeResults['database.rows'].parse(await runtimeRpc('database.rows', data)),
  );
