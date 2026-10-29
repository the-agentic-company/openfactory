import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import {
  createFactoryFiles,
  parseAgentDefinition,
  agentDefinition,
  updateFactoryYaml,
} from '@openfactory/core';
import { z } from 'zod';
import { ownedAgentSchema, projectSchema } from './contracts';
import { readDefinition, saveDefinition, definitionFilesSchema } from './definition-store';
import { prepareFactory, applyFactory, storedTeamSchema } from './factory-files';
import { Store } from './store';
import { legacyFactorySettings, readLegacyScorers } from './migrate-factory-settings';

export async function migrateDefinitions(store: Store, input: unknown) {
  const options = z
    .object({ apply: z.boolean().default(false), settingsDirectory: z.string().optional() })
    .parse(input);
  const settings =
    options.settingsDirectory ??
    process.env.OPENFACTORY_SETTINGS_DIR ??
    join(homedir(), '.config/openfactory/workspace');
  const scorers = readLegacyScorers(settings).map(({ path, scorer }) => ({
    path,
    scorer: {
      ...scorer,
      project:
        isAbsolute(scorer.project) && existsSync(scorer.project)
          ? realpathSync(scorer.project)
          : scorer.project,
    },
  }));
  const projects = store
    .all('projects', projectSchema)
    .map((project) => ({ ...project, workspaceRoot: realpathSync(project.workspaceRoot) }));
  for (const { scorer } of scorers) {
    if (
      scorer.project === 'all' ||
      projects.some((project) =>
        [project.id, project.workspaceRoot, project.title].includes(scorer.project),
      )
    ) {
      continue;
    }
    if (
      !isAbsolute(scorer.project) ||
      !existsSync(scorer.project) ||
      !statSync(scorer.project).isDirectory()
    ) {
      throw new Error(
        `Scorer ${scorer.name} references an unavailable repository: ${scorer.project}`,
      );
    }
    // Preserve a scorer whose repository has no registered agents or runtime project yet.
    projects.push({
      id: scorer.project,
      title: basename(scorer.project),
      workspaceRoot: scorer.project,
    });
  }
  const plans = projects.map((project) => {
    const legacyRoot = join(
      settings,
      'definitions',
      createHash('sha256').update(project.id).digest('hex'),
    );
    const legacy = existsSync(join(legacyRoot, 'current'));
    const current = readDefinition(project.workspaceRoot);
    const agents = store
      .all('agents', ownedAgentSchema)
      .filter((agent) => agent.projectId === project.id);
    const generated = createFactoryFiles(project.title, agents);
    const files: Record<string, string> = current && !legacy ? { ...current.files } : {};
    const bindings: Record<string, string> = current && !legacy ? { ...current.bindings } : {};
    if (legacy) {
      const revision = z.uuid().parse(readFileSync(join(legacyRoot, 'current'), 'utf8').trim());
      const snapshot = join(legacyRoot, revision);
      const manifest = z
        .object({ paths: z.array(z.string()), bindings: z.record(z.string(), z.string()) })
        .parse(JSON.parse(readFileSync(join(snapshot, 'manifest.json'), 'utf8')));
      // Validate every path before opening any file from the old manifest.
      definitionFilesSchema.parse({
        files: Object.fromEntries(manifest.paths.map((path) => [path, ''])),
      });
      for (const path of manifest.paths) {
        files[path] = readFileSync(join(snapshot, path), 'utf8');
      }
      Object.assign(bindings, manifest.bindings);
      for (const [path, id] of Object.entries(bindings)) {
        const source = files[path];
        if (!source) {
          throw new Error(`${project.title}: missing saved agent ${path}.`);
        }
        const definition = parseAgentDefinition(source);
        const agent = agents.find((item) => item.id === id);
        if (definition.id && definition.id !== id) {
          throw new Error(`${project.title}: conflicting agent ID in ${path}.`);
        }
        // Preserve saved instructions and explicit settings; fill previously implicit runtime settings.
        if (agent) {
          const metadata = parseAgentDefinition(agentDefinition(agent));
          const missing = {
            ...metadata,
            ...definition,
            id,
            harness: { ...metadata.harness, ...definition.harness },
          };
          files[path] = agentDefinition(
            ownedAgentSchema.parse({
              ...agent,
              id,
              title: missing.description ?? agent.title,
              prompt: definition.prompt,
              schedule: missing.schedule,
              enabled: missing.enabled,
              runtimeMode: missing.runtimeMode,
              interactionMode: missing.interactionMode,
              workspaceStrategy: missing.workspaceStrategy,
              modelSelection: {
                instanceId: missing.harness.type,
                model: missing.harness.model,
                options: missing.harness.options,
              },
            }),
          );
        } else if (!definition.id) {
          files[path] = source.replace(
            /^---\r?\n/,
            (opening) => `${opening}id: ${JSON.stringify(id)}\n`,
          );
        }
      }
    }
    files['factory.yaml'] ??= generated.files['factory.yaml'] ?? '';
    for (const [path, id] of Object.entries(current && !legacy ? {} : generated.bindings)) {
      if (!Object.values(bindings).includes(id)) {
        if (files[path] !== undefined) {
          throw new Error(`${project.title}: agent path conflict: ${path}`);
        }
        files[path] = generated.files[path] ?? '';
      }
    }
    for (const team of store
      .all('teams', storedTeamSchema)
      .filter((item) => item.projectId === project.id && (!current || legacy))) {
      if (files[team.path] === undefined) {
        files[team.path] = team.source;
        if (team.instructions || team.source.includes('instructions:')) {
          files[team.path.replace(/team\.yaml$/, 'instructions.md')] = team.instructions;
        }
      }
    }
    const metadata = legacyFactorySettings(
      settings,
      project,
      [...new Set([...agents.map((agent) => agent.id), ...Object.values(bindings)])],
      scorers,
    );
    if (metadata.paths.length) {
      files['factory.yaml'] = updateFactoryYaml(files['factory.yaml'] ?? '', metadata.changes);
    }
    const prepared = prepareFactory(store, project, { files });
    if (
      current &&
      legacy &&
      JSON.stringify(Object.entries(current.files).sort(([a], [b]) => a.localeCompare(b))) !==
        JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
    ) {
      throw new Error(
        `${project.workspaceRoot}/factory already contains different files. Resolve the conflict before migrating.`,
      );
    }
    return {
      project,
      legacyRoot,
      legacyPaths: metadata.paths,
      status: current && !legacy && !metadata.paths.length ? 'already-migrated' : 'migrate',
      revision: current?.revision ?? null,
      definition: { files },
      prepared,
    };
  });
  const unmatchedScorers = scorers.filter(
    ({ path }) => !plans.some((plan) => plan.legacyPaths.includes(path)),
  );
  if (unmatchedScorers.length) {
    throw new Error(
      'Some saved scorers do not belong to a registered repository. Assign them to a factory before migrating.',
    );
  }
  const roots = plans.map((plan) => plan.project.workspaceRoot);
  if (new Set(roots).size !== roots.length) {
    throw new Error(
      'Multiple factories share a repository. Resolve duplicate repository registrations before migrating.',
    );
  }
  if (options.apply) {
    for (const plan of plans) {
      if (plan.status === 'migrate') {
        await saveDefinition(plan.project.workspaceRoot, plan.revision, plan.definition, () =>
          applyFactory(store, plan.prepared),
        );
        rmSync(plan.legacyRoot, { recursive: true, force: true });
      }
    }
    for (const path of new Set(plans.flatMap((plan) => plan.legacyPaths))) {
      rmSync(path, { force: true });
    }
  }
  return {
    applied: options.apply,
    factories: plans.map(({ project, status }) => ({
      projectId: project.id,
      location: join(project.workspaceRoot, 'factory'),
      status,
    })),
  };
}
