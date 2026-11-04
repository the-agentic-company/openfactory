type FactoryInstance = {
  computerId: string;
  project: { id: string; workspaceRoot: string; repository?: string | null };
};

function folderName(path: string) {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').split('/').at(-1)?.toLowerCase();
}

export function groupFactoryInstances<T extends FactoryInstance>(instances: T[]) {
  const repositoriesByFolder = new Map<string, Set<string>>();
  for (const { project } of instances) {
    const folder = folderName(project.workspaceRoot);
    if (folder && project.repository) {
      const repositories = repositoriesByFolder.get(folder) ?? new Set<string>();
      repositories.add(project.repository);
      repositoriesByFolder.set(folder, repositories);
    }
  }
  const groups = new Map<string, T[]>();
  for (const instance of instances) {
    const { project, computerId } = instance;
    const repositories = repositoriesByFolder.get(folderName(project.workspaceRoot) ?? '');
    const repository =
      project.repository ?? (repositories?.size === 1 ? [...repositories][0] : null);
    const key = repository ?? `local:${computerId}:${project.id}`;
    const group = groups.get(key) ?? [];
    group.push(instance);
    groups.set(key, group);
  }
  return groups;
}
