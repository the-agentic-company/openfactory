import { parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import type { Agent } from './agents';

const frontmatterSchema = z.strictObject({
  description: z.string().trim().min(1).max(120).optional(),
  agentType: z.literal('CUSTOM').optional(),
  harness: z
    .strictObject({
      type: z.enum(['codex', 'claude', 'claude-code']).optional(),
      model: z.string().trim().min(1).max(200).optional(),
    })
    .optional(),
});

export function parseAgentDefinition(source: string) {
  if (source.length > 20000) {
    throw new Error('Keep agent.md under 20,000 characters.');
  }
  const match = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) {
    throw new Error('Start agent.md with YAML frontmatter between --- lines.');
  }
  const document = parseDocument(match[1] ?? '', { uniqueKeys: true, stringKeys: true });
  const problem = document.errors[0] ?? document.warnings[0];
  if (problem) {
    throw new Error(problem.message);
  }
  const metadata = frontmatterSchema.safeParse(document.toJS({ maxAliasCount: 0 }) ?? {});
  if (!metadata.success) {
    throw new Error(
      metadata.error.issues
        .map((issue) => `${issue.path.join('.') || 'frontmatter'}: ${issue.message}`)
        .join('\n'),
    );
  }
  const prompt = z.string().trim().min(1).max(16000).parse(match[2]);
  return { ...metadata.data, prompt };
}

export function agentDefinition(agent: Agent) {
  return `---\n${stringify({ description: agent.title, agentType: 'CUSTOM', harness: { model: agent.modelSelection.model } })}---\n\n${agent.prompt}\n`;
}

export function agentDirectory(agent: Agent) {
  const name =
    agent.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'agent';
  // IDs are encoded in full so renamed and identically titled agents never collide.
  return `${name.slice(0, 40)}-${encodeURIComponent(agent.id)}`;
}
