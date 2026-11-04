import { useMutation } from '@tanstack/react-query';
import type { WorkspaceView } from '@openfactory/core';
import { selectComputer } from '../server/connections';
import { agentName, projectName } from '../project-path';
import { native } from './computer-connections';
import type { FactoriesData } from './all-factories';

export function useOpenComputerFactory() {
  return useMutation({
    mutationFn: async ({
      computerId,
      workspaceRoot,
      agent,
      view = 'agents',
    }: {
      computerId: string;
      workspaceRoot: string;
      agent?: { id: string; title: string; section?: 'runs' };
      view?: WorkspaceView | 'teams';
    }) => {
      const api = native();
      if (api) {
        await api.invoke('select-computer', { id: computerId });
      } else {
        await selectComputer({ data: { id: computerId } });
      }
      const root = `/app/projects/${encodeURIComponent(projectName(workspaceRoot))}`;
      window.location.assign(
        agent
          ? `${root}/agents/${encodeURIComponent(agentName(agent))}${agent.section ? `/${agent.section}` : ''}`
          : `${root}/${view}`,
      );
    },
  });
}
export function machineName(data: FactoriesData, id: string) {
  const computer = data.computers.find((entry) => entry.id === id);
  return computer?.local
    ? (data.settings.data?.local?.host.name ?? computer.name)
    : (computer?.name ?? id);
}
