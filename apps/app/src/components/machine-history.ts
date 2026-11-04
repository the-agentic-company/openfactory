import { useQueries } from '@tanstack/react-query';
import { agentRunSchema, type Agent } from '@openfactory/core';
import { z } from 'zod';
import { getComputerAgentHistory } from '../server/computer-workspaces';
import { useComputerFactories } from './all-factories';
import { native } from './computer-connections';

const historySchema = z.object({ runs: z.array(agentRunSchema), truncated: z.boolean() });
export function useOtherMachineHistory(agent: Agent) {
  const data = useComputerFactories();
  const group = data.groups.find((group) =>
    group.instances.some(
      (instance) =>
        instance.computerId === data.settings.data?.activeId &&
        instance.project.id === agent.projectId,
    ),
  );
  const sources = (group?.instances ?? []).filter(
    (instance) =>
      instance.computerId !== data.settings.data?.activeId &&
      instance.agents.some((entry) => entry.id === agent.id),
  );
  const results = useQueries({
    queries: sources.map((source) => {
      const computer = data.computers.find((entry) => entry.id === source.computerId);
      const key = JSON.stringify([
        'machine-history',
        source.computerId,
        computer?.origin,
        agent.id,
      ]);
      return {
        queryKey: ['machine-history', source.computerId, computer?.origin, agent.id],
        queryFn: async () => {
          const api = native();
          const history = historySchema.parse(
            api
              ? await api.invoke('agent-history', {
                  computerId: source.computerId,
                  data: { id: agent.id },
                })
              : await getComputerAgentHistory({
                  data: { computerId: source.computerId, id: agent.id },
                }),
          );
          try {
            localStorage.setItem(key, JSON.stringify(history));
          } catch {
            /* Keep live history available when storage is full. */
          }
          return history;
        },
        initialData: () => {
          if (typeof window === 'undefined') {
            return undefined;
          }
          try {
            const cached = historySchema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'));
            return cached.success ? cached.data : undefined;
          } catch {
            return undefined;
          }
        },
        initialDataUpdatedAt: 0,
        retry: false,
        refetchInterval: 10000,
      };
    }),
  });
  return {
    runs: results.flatMap((result, index) =>
      (result.data?.runs ?? []).map((run) => ({
        ...run,
        id: `${sources[index]?.computerId}:${run.id}`,
        machine:
          data.computers.find((entry) => entry.id === sources[index]?.computerId)?.name ??
          'Other machine',
        remote: true,
      })),
    ),
    errors: results.flatMap((result, index) =>
      result.error
        ? [
            `${data.computers.find((entry) => entry.id === sources[index]?.computerId)?.name}: ${result.error.message}`,
          ]
        : [],
    ),
  };
}
