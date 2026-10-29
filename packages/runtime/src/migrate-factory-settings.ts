import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { agentAppearanceSchema, scorerSchema, type AgentAppearance } from '@openfactory/core';
import { z } from 'zod';
import { projectSchema } from './contracts';

type Project = z.infer<typeof projectSchema>;
function hash(id: string) {
  return createHash('sha256').update(id).digest('hex');
}
const legacyAppearance = z
  .union([
    agentAppearanceSchema,
    z.string().transform((name): AgentAppearance => ({ kind: 'icon', name })),
  ])
  .transform((value): AgentAppearance => {
    if (value.kind !== 'icon' || value.color !== undefined) {
      return value;
    }
    return {
      ...value,
      name:
        value.name === 'code' ? 'code-2' : value.name === 'shield' ? 'shield-check' : value.name,
    };
  });
const legacyProfile = z.object({ title: z.string().trim().min(1).max(80), icon: legacyAppearance });
export function readLegacyScorers(settings: string) {
  const directory = join(settings, 'scorers');
  return existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith('.json'))
        .map((name) => {
          const path = join(directory, name);
          return { path, scorer: scorerSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) };
        })
    : [];
}
export function legacyFactorySettings(
  settings: string,
  project: Project,
  agentIds: string[],
  scorers: ReturnType<typeof readLegacyScorers>,
) {
  const paths: string[] = [];
  const profilePath = join(settings, 'factories', `${hash(project.id)}.json`);
  const profile = existsSync(profilePath)
    ? legacyProfile.parse(JSON.parse(readFileSync(profilePath, 'utf8')))
    : null;
  if (profile) {
    paths.push(profilePath);
  }
  const agentAppearances: Record<string, AgentAppearance> = {};
  for (const id of agentIds) {
    const path = join(settings, 'appearances', `${hash(id)}.json`);
    if (existsSync(path)) {
      agentAppearances[id] = legacyAppearance.parse(JSON.parse(readFileSync(path, 'utf8')));
      paths.push(path);
    }
  }
  const selected = scorers.filter(
    ({ scorer }) =>
      scorer.project === 'all' ||
      [project.id, project.workspaceRoot, project.title].includes(scorer.project),
  );
  paths.push(...selected.map(({ path }) => path));
  return {
    paths,
    changes: {
      ...(profile ? { name: profile.title, icon: profile.icon } : {}),
      ...(Object.keys(agentAppearances).length ? { agentAppearances } : {}),
      ...(selected.length
        ? {
            scorers: selected.map(({ scorer }) => {
              const value = hash(`${scorer.id}:${project.id}`);
              const id =
                scorer.project === 'all'
                  ? `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`
                  : scorer.id;
              const { project: _scope, ...definition } = scorer;
              return { ...definition, id };
            }),
          }
        : {}),
    },
  };
}
