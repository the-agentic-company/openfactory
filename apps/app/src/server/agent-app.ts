import { createServerFn } from '@tanstack/react-start';
import { runtimeInputs, runtimeResults } from '@openfactory/runtime/rpc';
import { runtimeRpc } from './runtime-rpc';

export const readAgentApp = createServerFn({ method: 'GET' })
  .validator(runtimeInputs['apps.read'])
  .handler(async ({ data }) =>
    runtimeResults['apps.read'].parse(await runtimeRpc('apps.read', data)),
  );
export const queryAgentApp = createServerFn({ method: 'POST' })
  .validator(runtimeInputs['apps.query'])
  .handler(async ({ data }) =>
    runtimeResults['apps.query'].parse(await runtimeRpc('apps.query', data)),
  );
export const promptAgentApp = createServerFn({ method: 'POST' })
  .validator(runtimeInputs['apps.prompt'])
  .handler(async ({ data }) =>
    runtimeResults['apps.prompt'].parse(await runtimeRpc('apps.prompt', data)),
  );
