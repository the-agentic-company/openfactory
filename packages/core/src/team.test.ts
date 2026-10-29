import { describe, expect, it } from 'vite-plus/test';
import { stringify } from 'yaml';
import { agentSchema } from './agents';
import { factoryTeamSetups, parseTeamYaml, resolveTeam } from './team';
import { validateFactoryFile } from './factory-definition';

const definition = {
  schemaVersion: 'v1alpha1',
  name: 'Reliability',
  description: 'Keep the project healthy.',
  instructions: './instructions.md',
  lead: 'operator',
  members: {
    operator: { agent: 'agents/operator/agent.md' },
    digest: { agent: 'agents/digest/agent.md', reportsTo: 'operator' },
  },
};
const source = stringify(definition);
const files = {
  'teams/reliability/team.yaml': source,
  'teams/reliability/instructions.md': 'Respect existing approval holds.',
  'agents/operator/agent.md': '---\n---\nOperate.',
  'agents/digest/agent.md': '---\n---\nReport.',
};
const bindings = {
  'agents/operator/agent.md': 'operator-id',
  'agents/digest/agent.md': 'digest-id',
};
const agent = (id: string) =>
  agentSchema.parse({
    id,
    title: id,
    prompt: 'Actual runtime instructions',
    enabled: true,
    schedule: { type: 'manual' },
    projectId: 'mibba',
    threadId: null,
    modelSelection: { instanceId: 'codex', model: 'test' },
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: 'never',
    lastRunError: null,
    runCount: 0,
  });

describe('referenced team definitions', () => {
  it('resolves the team to actual runtime agents without duplicating their settings', () => {
    const [setup] = factoryTeamSetups(files, bindings);
    expect(setup).toBeDefined();
    if (!setup) {
      throw new Error('Missing setup');
    }
    const team = resolveTeam(setup, [agent('operator-id'), { ...agent('digest-id'), runCount: 7 }]);
    expect(team.definition.lead).toBe('operator');
    expect(team.instructions).toBe('Respect existing approval holds.');
    expect(
      team.agents.map((member) => [member.id, member.agent.id, member.agent.runCount]),
    ).toEqual([
      ['operator', 'operator-id', 0],
      ['digest', 'digest-id', 7],
    ]);
    expect(team.agents[1]?.agent.prompt).toBe('Actual runtime instructions');
  });
  it('rejects missing leads, broken reporting lines, cycles, and duplicate agent references', () => {
    expect(() => parseTeamYaml(source.replace('lead: operator', 'lead: missing'))).toThrow('lead');
    expect(() =>
      parseTeamYaml(source.replace('reportsTo: operator', 'reportsTo: missing')),
    ).toThrow('unknown member');
    expect(() => parseTeamYaml(source.replace('reportsTo: operator', 'reportsTo: digest'))).toThrow(
      'Reporting cycle',
    );
    expect(() =>
      parseTeamYaml(source.replace('agents/digest/agent.md', 'agents/operator/agent.md')),
    ).toThrow('more than once');
    expect(() => parseTeamYaml(source.replace('reportsTo: operator', ''))).toThrow(
      'Only the team lead',
    );
    expect(() =>
      parseTeamYaml(source.replace('operator:\n', 'operator:\n    reportsTo: digest\n')),
    ).toThrow();
  });
  it('rejects missing instruction files, unbound agents, and missing live agents', () => {
    expect(() => factoryTeamSetups({ 'teams/reliability/team.yaml': source }, bindings)).toThrow(
      'missing',
    );
    expect(() => factoryTeamSetups(files, {})).toThrow('binding');
    const setup = factoryTeamSetups(files, bindings)[0];
    if (!setup) {
      throw new Error('Missing setup');
    }
    expect(() => resolveTeam(setup, [agent('operator-id')])).toThrow('unavailable agent');
  });
  it('validates each file by its actual type and rejects unsafe or unknown paths', () => {
    expect(validateFactoryFile('teams/reliability/team.yaml', source)).toMatchObject({
      lead: 'operator',
    });
    expect(validateFactoryFile('teams/reliability/instructions.md', 'Shared guidance')).toBe(
      'Shared guidance',
    );
    expect(() => validateFactoryFile('teams/../team.yaml', source)).toThrow();
    expect(() => validateFactoryFile('unknown.md', '---\n---\nHello')).toThrow();
    expect(() =>
      parseTeamYaml(source.replace('agents/digest/agent.md', '../outside/agent.md')),
    ).toThrow();
    expect(() => parseTeamYaml(`${source}\nname: duplicate`)).toThrow();
  });
});
