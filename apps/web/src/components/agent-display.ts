import type { Agent } from '@openfactory/core';
export function agentDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}
export function agentStateLabel(agent: Agent) {
  if (!agent.enabled) {
    return 'Paused';
  }
  if (agent.lastRunStatus === 'failed') {
    return 'Dispatch failed';
  }
  return agent.lastRunStatus === 'running' ? 'Dispatching' : 'Enabled';
}
