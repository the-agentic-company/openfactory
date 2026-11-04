import { readFactoryRuns } from '@openfactory/client';
import { runtimeRpc } from './runtime-rpc';

export function loadFactoryRuns(project: string) {
  return readFactoryRuns(project, runtimeRpc);
}
