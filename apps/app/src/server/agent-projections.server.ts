import { readAgent, readAgentProjections } from '@openfactory/client';
import { runtimeRpc } from './runtime-rpc';

export function loadAgent(id: string) {
  return readAgent(id, runtimeRpc);
}
export function loadAgentProjections(id: string) {
  return readAgentProjections(id, runtimeRpc);
}
