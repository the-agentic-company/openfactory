import { migrateMachineAssignment } from '@openfactory/protocol/legacy-machine';
import { groupFactoryInstances } from '@openfactory/protocol/factory-identity';
import { agentSchema } from '@openfactory/core';
import { z } from 'zod';
import { factoryProfileSchema } from './factory-profile';

export const computerIconSchema = z.enum([
  'laptop',
  'monitor',
  'server',
  'server-cog',
  'cloud',
  'database',
  'cpu',
  'hard-drive',
  'smartphone',
]);
export const computerWorkspaceSchema = z.object({
  agents: z.array(agentSchema),
  projects: z.array(
    z.preprocess(
      migrateMachineAssignment,
      z.object({
        id: z.string(),
        title: z.string(),
        workspaceRoot: z.string(),
        repository: z.string().nullable().optional(),
        branch: z.string().nullable().optional(),
        commit: z.string().nullable().optional(),
        machineEnabled: z.boolean().default(true),
        machineRevision: z.string().optional(),
      }),
    ),
  ),
  profiles: z.record(z.string(), factoryProfileSchema),
});
export type ComputerWorkspace = z.infer<typeof computerWorkspaceSchema>;

export function groupComputerFactories(
  workspaces: { computerId: string; workspace: ComputerWorkspace }[],
) {
  const instances = workspaces.flatMap(({ computerId, workspace }) =>
    workspace.projects.map((project) => {
      const profile = workspace.profiles[project.id];
      return {
        computerId,
        project: { ...project, title: profile?.title ?? project.title },
        agents: workspace.agents.filter((agent) => agent.projectId === project.id),
        icon: profile?.icon,
      };
    }),
  );
  const groups = groupFactoryInstances(instances);
  return [...groups.entries()]
    .map(([key, instances]) => {
      const enabled = instances.filter((instance) => instance.project.machineEnabled);
      return {
        key,
        instances,
        title: (enabled.length === 1 ? enabled[0] : instances[0])?.project.title ?? '',
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export type FactoryGroup = ReturnType<typeof groupComputerFactories>[number];
export function factoryMachine(group: FactoryGroup) {
  const enabled = group.instances.filter((instance) => instance.project.machineEnabled);
  return enabled.length === 1 ? enabled[0] : undefined;
}
