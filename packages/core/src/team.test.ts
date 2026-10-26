import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { parseTeamYaml } from './team';

const demo = readFileSync(new URL('../../../teams/reliability.yaml', import.meta.url), 'utf8');
describe('YAML team blueprints', () => {
  it('loads the actual demo with two scheduled roles and independent prompts', () => {
    const team = parseTeamYaml(demo);
    expect(team.agents).toHaveLength(6);
    expect(
      team.agents
        .filter((agent) => agent.trigger.type === 'interval' || agent.trigger.type === 'daily')
        .map((agent) => agent.id),
    ).toEqual(['operator', 'digest']);
    expect(team.agents.find((agent) => agent.id === 'repair')?.reports_to).toBe('operator');
    expect(new Set(team.agents.map((agent) => agent.prompt)).size).toBe(6);
  });
  it('rejects broken reporting lines, cycles, and duplicate ids', () => {
    expect(() =>
      parseTeamYaml(demo.replace('reports_to: operator', 'reports_to: missing')),
    ).toThrow('unknown agent');
    expect(() =>
      parseTeamYaml(demo.replace('id: coordinator', 'id: coordinator\n    reports_to: operator')),
    ).toThrow('Reporting cycle');
    expect(() => parseTeamYaml(demo.replace('id: digest', 'id: operator'))).toThrow(
      'Duplicate agent id',
    );
  });
  it('rejects malformed YAML and invalid schedule times without accepting a partial team', () => {
    expect(() => parseTeamYaml(`${demo}\nname: Duplicate`)).toThrow();
    expect(() => parseTeamYaml(demo.replace("'09:00'", "'29:00'"))).toThrow('Use a time');
    expect(() => parseTeamYaml(demo.replace('Europe/Paris', 'Europe/Nowhere'))).toThrow(
      'valid timezone',
    );
  });
});
