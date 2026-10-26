import { parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import { agentDefinition, agentDirectory, parseAgentDefinition } from './agent-definition';
import type { Agent } from './agents';

const factoryYamlSchema = z
  .object({
    schemaVersion: z.literal('v1alpha1'),
    name: z.string().trim().min(1).max(120),
    repositories: z.array(
      z.object({ owner: z.string().min(1), name: z.string().min(1) }).passthrough(),
    ),
    agentDefaults: z
      .object({
        model: z.string().min(1).optional(),
        harness: z
          .object({ type: z.string().min(1), model: z.string().min(1) })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .refine(
        (value) => Boolean(value.model) !== Boolean(value.harness),
        'Declare exactly one of model or harness.',
      ),
  })
  .passthrough();

export function validateFactoryFile(path: string, source: string) {
  if (path !== 'factory.yaml') {
    return parseAgentDefinition(source);
  }
  if (source.length > 100000) {
    throw new Error('Keep factory.yaml under 100,000 characters.');
  }
  const document = parseDocument(source, { uniqueKeys: true, stringKeys: true });
  const problem = document.errors[0] ?? document.warnings[0];
  if (problem) {
    throw new Error(problem.message);
  }
  const result = factoryYamlSchema.safeParse(document.toJS({ maxAliasCount: 0 }));
  if (!result.success) {
    throw new Error(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'),
    );
  }
  return result.data;
}

export function createFactoryFiles(name: string, agents: Agent[]) {
  const files: Record<string, string> = {
    'factory.yaml': stringify({
      schemaVersion: 'v1alpha1',
      name,
      repositories: [],
      agentDefaults: { model: 'auto' },
    }),
  };
  const bindings: Record<string, string> = {};
  for (const agent of agents) {
    const path = `agents/${agentDirectory(agent)}/agent.md`;
    files[path] = agentDefinition(agent);
    bindings[path] = agent.id;
  }
  return { files, bindings };
}
