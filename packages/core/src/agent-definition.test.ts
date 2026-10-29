import { describe, expect, it } from 'vite-plus/test';
import { agentSchema } from './agents';
import { agentDefinition, agentDirectory, parseAgentDefinition } from './agent-definition';

const agent = agentSchema.parse({
  id: 'task/one',
  title: 'Review: #1',
  prompt: 'Review the changes.\n\nKeep {{body.event}} literal.',
  enabled: false,
  schedule: { type: 'interval', everyMs: 60000 },
  projectId: 'project',
  threadId: null,
  modelSelection: { instanceId: 'codex', model: 'gpt-6.1-sol' },
  nextRunAt: null,
  lastRunAt: null,
  lastRunStatus: 'never',
  lastRunError: null,
  runCount: 0,
});

describe('agent.md definitions', () => {
  it('round trips a live agent with multiline instructions and YAML punctuation', () => {
    expect(parseAgentDefinition(agentDefinition(agent))).toEqual({
      description: agent.title,
      agentType: 'CUSTOM',
      schedule: agent.schedule,
      enabled: false,
      harness: { type: 'codex', model: 'gpt-6.1-sol' },
      prompt: agent.prompt,
    });
  });
  it.each([
    { type: 'interval', everyMs: 300000 },
    { type: 'fixed_time', timeOfDay: '09:30', weekdays: [1, 3, 5] },
    { type: 'webhook', signature: { header: 'x-signature', encoding: 'hex', prefix: 'sha256=' } },
  ])('includes the complete $type schedule in agent.md', (schedule) => {
    const scheduled = agentSchema.parse({ ...agent, schedule });
    expect(parseAgentDefinition(agentDefinition(scheduled)).schedule).toEqual(schedule);
  });
  it('accepts empty optional frontmatter and Windows line endings', () => {
    expect(parseAgentDefinition('---\n---\nReview changes.')).toEqual({
      prompt: 'Review changes.',
    });
    expect(parseAgentDefinition('---\r\n\r\n---\r\n\r\nReview changes.')).toEqual({
      prompt: 'Review changes.',
    });
  });
  it.each([
    'description: first\ndescription: second',
    'runner: linux',
    'schedule: { type: interval, everyMs: 0 }',
    'schedule: { type: unknown }',
    'agentType: FOREMAN',
    'harness:\n  auth: secret',
    'description: &name Review\nharness:\n  model: *name',
  ])('rejects unsupported or ambiguous configuration: %s', (metadata) => {
    expect(() => parseAgentDefinition(`---\n${metadata}\n---\n\nReview changes.`)).toThrow();
  });
  it('rejects missing frontmatter and empty or oversized instructions', () => {
    expect(() => parseAgentDefinition('Review changes.')).toThrow('frontmatter');
    expect(() => parseAgentDefinition('---\n---\n')).toThrow();
    expect(() => parseAgentDefinition(`---\n\n---\n${'x'.repeat(16001)}`)).toThrow();
  });
  it('uses safe distinct directories for duplicate titles and unsafe IDs', () => {
    const directory = agentDirectory(agent);
    expect(directory).not.toContain('/');
    expect(directory).toContain('task%2Fone');
    expect(agentDirectory({ ...agent, id: 'task/other' })).not.toBe(directory);
  });
});
