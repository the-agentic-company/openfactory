import { runtimeRpc } from '@openfactory/runtime/client';
import { z } from 'zod';
import { computerWorkspaceSchema } from '../computer-workspaces';
import { connectionPreferences, localNativeConnection } from './native-runtime.server';

export async function readComputerWorkspace(id: string) {
  const preferences = await connectionPreferences();
  const target =
    id === 'local'
      ? await localNativeConnection()
      : preferences.computers.find((computer) => computer.id === id);
  if (!target) {
    throw new Error('Computer not found. Refresh Settings.');
  }
  const [agents, workspace] = await Promise.all([
    runtimeRpc('agents.list', {}, target),
    runtimeRpc('workspace.snapshot', {}, target),
  ]);
  const tasks = z.object({ tasks: computerWorkspaceSchema.shape.agents }).parse(agents);
  const snapshot = z
    .object({ snapshot: z.object({ projects: computerWorkspaceSchema.shape.projects }) })
    .parse(workspace);
  const profiles = await runtimeRpc(
    'factory.settings',
    {
      operation: 'read',
      section: 'factories',
      ids: snapshot.snapshot.projects.map((project) => project.id),
    },
    target,
  );
  return computerWorkspaceSchema.parse({
    agents: tasks.tasks,
    projects: snapshot.snapshot.projects,
    profiles,
  });
}
