import {
  agentDefinition,
  factoryTeamSetups,
  createFactoryFiles,
  parseAgentDefinition,
  validateFactoryFile,
} from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getAgents } from './agents';
import { runtimeRpc } from './runtime-rpc';
import { applyAgentDefinition } from './apply-agent-definition.server';
import { DefinitionConflictError, readDefinition, saveDefinition } from './definition-store';

async function loadDefinition(projectId: string) {
  const workspace = await getAgents();
  if (!workspace.connected) {
    throw new Error('Start the OpenFactory runtime to load this factory definition.');
  }
  const project = workspace.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error('This factory no longer exists.');
  }
  const agents = workspace.agents.filter((agent) => agent.projectId === projectId);
  const generated = createFactoryFiles(project.title, agents);
  let stored = await readDefinition(projectId);
  const bindings = { ...stored?.bindings };
  const files = { ...stored?.files };
  if (!stored) {
    files['factory.yaml'] = generated.files['factory.yaml']!;
  }
  let changed = !stored;
  for (const [path, id] of Object.entries(generated.bindings)) {
    if (!Object.values(bindings).includes(id)) {
      bindings[path] = id;
      files[path] = generated.files[path]!;
      changed = true;
    }
  }
  for (const [path, id] of Object.entries(bindings)) {
    const source = files[path];
    const agent = agents.find((item) => item.id === id);
    if (source && agent && !parseAgentDefinition(source).schedule) {
      files[path] = source.replace(
        /^---\r?\n/,
        (opening) => `${opening}schedule: ${JSON.stringify(agent.schedule)}\n`,
      );
      changed = true;
    }
  }
  if (changed) {
    try {
      stored = await saveDefinition(projectId, stored?.revision ?? null, { files, bindings });
    } catch (error) {
      if (!(error instanceof DefinitionConflictError)) {
        throw error;
      }
      // Concurrent initialization or a new agent arriving must not overwrite saved edits.
      stored = await readDefinition(projectId);
      if (!stored) {
        throw error;
      }
    }
  }
  if (!stored) {
    throw new Error('The factory definition could not be loaded. Retry.');
  }
  return {
    ...stored,
    projectId,
    files: Object.entries(stored.files).map(([path, source]) => {
      const agent = agents.find((item) => item.id === stored.bindings[path]);
      return {
        path,
        source,
        agentId: stored.bindings[path] ?? null,
        liveSource: agent ? agentDefinition(agent) : null,
      };
    }),
  };
}

export const getFactoryDefinition = createServerFn({ method: 'GET' })
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(({ data }) => loadDefinition(data.projectId));

export const saveFactoryDefinitionFile = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      projectId: z.string().min(1),
      path: z.string().max(300),
      source: z.string().max(100000),
      revision: z.uuid(),
      expectedRuntime: z.string().max(20000).nullable(),
    }),
  )
  .handler(async ({ data }) => {
    validateFactoryFile(data.path, data.source);
    const current = await loadDefinition(data.projectId);
    const selected = current.files.find((file) => file.path === data.path);
    if (!selected) {
      throw new Error('This file no longer exists. Reload files.');
    }
    if (selected.agentId && !selected.liveSource) {
      throw new Error('This agent was removed. Its saved definition is read-only.');
    }
    const sources = Object.fromEntries(current.files.map((file) => [file.path, file.source]));
    sources[data.path] = data.source;
    const teams = factoryTeamSetups(sources, current.bindings);
    const agentId = selected.agentId;
    const result = await saveDefinition(
      data.projectId,
      data.revision,
      { files: sources, bindings: current.bindings },
      agentId
        ? () => {
            if (!data.expectedRuntime) {
              throw new Error('Reload the live agent before saving.');
            }
            return applyAgentDefinition({
              id: agentId,
              source: data.source,
              expectedSource: data.expectedRuntime,
            });
          }
        : data.path.startsWith('teams/')
          ? () => runtimeRpc('teams.replace', { projectId: data.projectId, teams })
          : undefined,
    );
    return {
      revision: result.revision,
      location: result.location,
      applied: Boolean(selected.agentId) || data.path.startsWith('teams/'),
    };
  });
