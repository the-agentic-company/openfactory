import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  createFactoryFiles,
  factoryTeamSetups,
  parseTeamYaml,
  teamFilePathSchema,
  validateFactoryFile,
} from '@openfactory/core';
import { z } from 'zod';
import { ownedAgentSchema, projectSchema } from './contracts';
import { readDefinition, saveDefinition } from './definition-store';

type Rpc = (method: string, input: unknown) => Promise<unknown>;

export async function applyTeamFile(projectId: string, teamFile: string, rpc: Rpc) {
  const project = z
    .object({ snapshot: z.object({ projects: z.array(projectSchema) }) })
    .parse(await rpc('workspace.snapshot', {}))
    .snapshot.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error('This factory no longer exists.');
  }
  const agents = z
    .object({ tasks: z.array(ownedAgentSchema) })
    .parse(await rpc('agents.list', {}))
    .tasks.filter((agent) => agent.projectId === projectId);
  const generated = createFactoryFiles(project.title, agents);
  const current = await readDefinition(projectId);
  const files = { ...current?.files };
  const bindings = { ...current?.bindings };
  if (!current) {
    files['factory.yaml'] = generated.files['factory.yaml'] ?? '';
  }
  for (const [path, id] of Object.entries(generated.bindings)) {
    if (!Object.values(bindings).includes(id)) {
      bindings[path] = id;
      files[path] = generated.files[path] ?? '';
    }
  }
  const path = teamFilePathSchema.parse(`teams/${basename(dirname(teamFile))}/team.yaml`);
  const source = await readFile(teamFile, 'utf8');
  const definition = parseTeamYaml(source);
  files[path] = source;
  if (definition.instructions) {
    const guidancePath = path.replace(/team\.yaml$/, 'instructions.md');
    files[guidancePath] = await readFile(join(dirname(teamFile), 'instructions.md'), 'utf8');
    validateFactoryFile(guidancePath, files[guidancePath]);
  }
  const teams = factoryTeamSetups(files, bindings);
  const saved = await saveDefinition(
    projectId,
    current?.revision ?? null,
    { files, bindings },
    () => rpc('teams.replace', { projectId, teams }),
  );
  return { path, revision: saved.revision, location: saved.location };
}
