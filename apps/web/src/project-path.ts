import { notFound } from '@tanstack/react-router';

function slug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function projectName(path: string) {
  return (
    slug(
      path
        .replace(/[\\/]+$/, '')
        .split(/[\\/]/)
        .at(-1) || path,
    ) || 'project'
  );
}

export function agentName(agent: { id: string; title: string }) {
  return slug(agent.id.includes(':') ? agent.id.split(':').at(-1) || agent.title : agent.title);
}

export function projectAgent<T extends { id: string; title: string; projectPath?: string | null }>(
  name: string,
  workspaceRoot: string,
  agents: ReadonlyArray<T>,
) {
  const matches = agents.filter(
    (agent) => agent.projectPath === workspaceRoot && agentName(agent) === name,
  );
  const [agent] = matches;
  if (!agent || matches.length !== 1) {
    throw notFound();
  }
  return agent;
}

export function projectWorkspace(name: string, projects: ReadonlyArray<{ workspaceRoot: string }>) {
  const matches = projects.filter((project) => projectName(project.workspaceRoot) === name);
  const [project] = matches;
  if (!project || matches.length !== 1) {
    throw notFound();
  }
  return project.workspaceRoot;
}
