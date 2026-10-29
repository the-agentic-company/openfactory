import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  factoryTeamSetups,
  parseTeamYaml,
  teamFilePathSchema,
  validateFactoryFile,
} from '@openfactory/core';
import { z } from 'zod';
import { projectSchema } from './contracts';
import { savedDefinitionSchema } from './definition-store';

type Rpc = (method: string, input: unknown) => Promise<unknown>;

export async function applyTeamFile(projectId: string, teamFile: string, rpc: Rpc) {
  const project = z
    .object({ snapshot: z.object({ projects: z.array(projectSchema) }) })
    .parse(await rpc('workspace.snapshot', {}))
    .snapshot.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error('This factory no longer exists.');
  }
  const current = savedDefinitionSchema.parse(await rpc('definitions.get', { projectId }));
  const files = { ...current.files };
  const path = teamFilePathSchema.parse(`teams/${basename(dirname(teamFile))}/team.yaml`);
  const source = await readFile(teamFile, 'utf8');
  const definition = parseTeamYaml(source);
  files[path] = source;
  if (definition.instructions) {
    const guidancePath = path.replace(/team\.yaml$/, 'instructions.md');
    files[guidancePath] = await readFile(join(dirname(teamFile), 'instructions.md'), 'utf8');
    validateFactoryFile(guidancePath, files[guidancePath]);
  }
  factoryTeamSetups(files, current.bindings);
  const saved = savedDefinitionSchema.parse(
    await rpc('definitions.save', { projectId, revision: current.revision, files }),
  );
  return { path, revision: saved.revision, location: saved.location };
}
