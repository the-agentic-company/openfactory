import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import {
  agentDefinition,
  factoryTeamSetups,
  factoryYamlSchema,
  parseAgentDefinition,
  resolveTeam,
  teamSetupSchema,
  validateFactoryFile,
} from '@openfactory/core';
import { z } from 'zod';
import { ownedAgentSchema, projectSchema } from './contracts';
import { definitionBindings, type DefinitionFiles } from './definition-store';
import { nextScheduledAt } from './schedule';
import { Store } from './store';

export const storedTeamSchema = teamSetupSchema.extend({ projectId: z.string() });
export const teamKey = (projectId: string, path: string) => JSON.stringify([projectId, path]);

export function prepareFactory(
  store: Store,
  project: z.infer<typeof projectSchema>,
  { files }: DefinitionFiles,
) {
  for (const [path, source] of Object.entries(files)) {
    validateFactoryFile(path, source);
  }
  const factory = factoryYamlSchema.parse(
    validateFactoryFile('factory.yaml', files['factory.yaml'] ?? ''),
  );
  const bindings = definitionBindings(files);
  const agents = Object.entries(bindings).map(([path, id]) => {
    const definition = parseAgentDefinition(files[path] ?? '');
    const existing = store.get('agents', id, ownedAgentSchema);
    if (existing && existing.projectId !== project.id) {
      throw new Error(`${path}: agent ID already belongs to another factory.`);
    }
    const schedule = definition.schedule ?? { type: 'manual' };
    const enabled = definition.enabled ?? false;
    const sameSchedule = JSON.stringify(existing?.schedule) === JSON.stringify(schedule);
    return ownedAgentSchema.parse({
      ...existing,
      id,
      projectId: project.id,
      title: definition.description ?? basename(path.slice(0, -'/agent.md'.length)),
      prompt: definition.prompt,
      schedule,
      enabled,
      modelSelection: {
        instanceId: definition.harness?.type ?? factory.agentDefaults.harness?.type ?? 'codex',
        model:
          definition.harness?.model ??
          factory.agentDefaults.harness?.model ??
          factory.agentDefaults.model,
        options: definition.harness?.options,
      },
      runtimeMode: definition.runtimeMode ?? 'approval-required',
      interactionMode: definition.interactionMode ?? 'default',
      workspaceStrategy: definition.workspaceStrategy ?? { type: 'root' },
      threadId: existing?.threadId ?? null,
      nextRunAt: enabled
        ? sameSchedule && existing?.enabled
          ? existing.nextRunAt
          : nextScheduledAt(schedule, new Date())
        : null,
      lastRunAt: existing?.lastRunAt ?? null,
      lastRunStatus: existing?.lastRunStatus ?? 'never',
      lastRunError: existing?.lastRunError ?? null,
      runCount: existing?.runCount ?? 0,
    });
  });
  const teams = factoryTeamSetups(files, bindings);
  for (const team of teams) {
    resolveTeam(team, agents);
  }
  return { project: { ...project, title: factory.name }, agents, teams };
}
export function applyFactory(store: Store, prepared: ReturnType<typeof prepareFactory>) {
  store.transaction(() => {
    const { project, agents, teams } = prepared;
    store.put('projects', project.id, project);
    const ids = new Set(agents.map((agent) => agent.id));
    for (const previous of store.all('agents', ownedAgentSchema)) {
      if (previous.projectId === project.id && !ids.has(previous.id)) {
        store.put('agents', previous.id, { ...previous, enabled: false, nextRunAt: null });
      }
    }
    for (const agent of agents) {
      store.put('agents', agent.id, agent);
      if (!store.get('secrets', agent.id, z.unknown())) {
        store.put('secrets', agent.id, {
          token: randomBytes(32).toString('hex'),
          signatureSecret: null,
        });
      }
    }
    for (const team of store.all('teams', storedTeamSchema)) {
      if (team.projectId === project.id) {
        store.delete('teams', teamKey(project.id, team.path));
      }
    }
    for (const team of teams) {
      store.put('teams', teamKey(project.id, team.path), { ...team, projectId: project.id });
    }
  });
}
export function agentFileEdit(
  files: Record<string, string>,
  bindings: Record<string, string>,
  agent: z.infer<typeof ownedAgentSchema>,
) {
  const path = Object.entries(bindings).find(([, id]) => id === agent.id)?.[0];
  if (!path) {
    throw new Error('This agent has no repository definition.');
  }
  return { files: { ...files, [path]: agentDefinition(agent) } };
}
