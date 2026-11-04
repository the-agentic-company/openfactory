import { groupFactoryInstances } from '@openfactory/protocol/factory-identity';
import { createServerFn } from '@tanstack/react-start';
import { runtimeRpc } from '@openfactory/runtime/client';
import { z } from 'zod';
import { connectionPreferences, localNativeConnection } from './native-runtime.server';
import { readComputerWorkspace } from './computer-workspaces.server';

const instance = z.object({ computerId: z.string(), projectId: z.string() });
export const machineSelectionSchema = z.object({
  repository: z.string().nullable(),
  instances: z.array(instance).min(1),
  destination: instance,
});
export const changeFactoryMachine = createServerFn({ method: 'POST' })
  .validator(machineSelectionSchema)
  .handler(async ({ data }) => {
    const preferences = await connectionPreferences();
    const machines = ['local', ...preferences.computers.map((computer) => computer.id)];
    const discovered = await Promise.all(
      machines.map(async (computerId) => {
        const target =
          computerId === 'local'
            ? await localNativeConnection()
            : preferences.computers.find((computer) => computer.id === computerId);
        if (!target) {
          throw new Error('Machine is no longer paired.');
        }
        const workspace = await readComputerWorkspace(computerId);
        return workspace.projects.map((project) => ({
          computerId,
          project,
          projectId: project.id,
          target,
          revision: project.machineRevision ?? 'initial',
        }));
      }),
    );
    const group = [...groupFactoryInstances(discovered.flat()).values()].find((instances) =>
      instances.some(
        (entry) =>
          entry.computerId === data.destination.computerId &&
          entry.projectId === data.destination.projectId,
      ),
    );
    const targets = (group ?? []).sort((a, b) =>
      `${a.target.origin}:${a.projectId}`.localeCompare(`${b.target.origin}:${b.projectId}`),
    );
    const destination = targets.find(
      (entry) =>
        entry.computerId === data.destination.computerId &&
        entry.projectId === data.destination.projectId,
    );
    if (!destination) {
      throw new Error('Choose a registered factory folder.');
    }
    // Disable every copy before enabling the destination. A failure leaves execution paused.
    for (const entry of targets) {
      const result = await runtimeRpc(
        'factory.machine',
        { projectId: entry.projectId, enabled: false, expectedRevision: entry.revision },
        entry.target,
      );
      entry.revision = z.object({ revision: z.string() }).parse(result).revision;
    }
    await runtimeRpc(
      'factory.machine',
      { projectId: destination.projectId, enabled: true, expectedRevision: destination.revision },
      destination.target,
    );
    return { selected: destination.computerId };
  });
