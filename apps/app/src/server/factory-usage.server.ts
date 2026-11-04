import { loadFactoryUsage as readUsage } from '@openfactory/runtime/usage';
import { loadFactoryRuns } from './factory-runs.server';

export function loadFactoryUsage(data: Parameters<typeof readUsage>[0]) {
  return readUsage(data, loadFactoryRuns);
}
