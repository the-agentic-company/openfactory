import type { Agent, MarketplaceEntry, MarketplaceKind } from '@openfactory/core';

export const marketplaceTypes = [
  { kind: 'factory', label: 'Factories' },
  { kind: 'agent', label: 'Agents' },
  { kind: 'automation', label: 'Automations' },
  { kind: 'team', label: 'Teams' },
] satisfies { kind: MarketplaceKind; label: string }[];

type ExampleAgent = Pick<Agent, 'title' | 'prompt' | 'schedule'> & { name: string };
type ExamplePublication = { installs: number; firstSeen: string };
type ExampleFactory = ExamplePublication & {
  slug: string;
  title: string;
  source: string;
  description: string;
  stars: number;
  agents: ExampleAgent[];
  team: boolean;
};
export type MarketplaceExample = MarketplaceEntry &
  ExamplePublication & {
    slug: string;
    files: Record<string, string>;
    agentCount: number;
    teamCount: number;
  };
const reviewer = {
  name: 'reviewer',
  title: 'Code reviewer',
  prompt:
    'Review the current changes against the repository instructions. Trace changed behavior through its callers. Report concrete bugs with file locations and reproduction steps. Do not edit files or publish comments.',
  schedule: { type: 'manual' },
} satisfies ExampleAgent;
const tester = {
  name: 'test-specialist',
  title: 'Test specialist',
  prompt:
    'Run the relevant existing checks for the current changes. Report failures with exact commands and identify missing behavior coverage. Do not modify files.',
  schedule: { type: 'manual' },
} satisfies ExampleAgent;
const examples: ExampleFactory[] = [
  {
    slug: 'code-review',
    title: 'Code review',
    source: 'example-labs/review-factory',
    description:
      'A second pair of eyes on every change. A reviewer and test specialist check behavior together.',
    stars: 2400,
    installs: 12400,
    firstSeen: '2026-09-14',

    team: true,
    agents: [reviewer, tester],
  },
  {
    slug: 'engineering',
    title: 'Engineering team',
    source: 'example-labs/engineering',
    description: 'Take a scoped issue from plan to implementation, review, and verification.',
    stars: 1800,
    installs: 8700,
    firstSeen: '2026-09-19',

    team: true,
    agents: [
      {
        name: 'implementer',
        title: 'Implementer',
        prompt:
          'Read the repository instructions and the assigned issue. Implement the smallest complete change, run the relevant checks, and summarize the resulting behavior.',
        schedule: { type: 'manual' },
      },
      reviewer,
      tester,
    ],
  },
  {
    slug: 'daily-brief',
    title: 'Daily project brief',
    source: 'example-labs/daily-brief',
    description:
      'Start the day with recent commits, unfinished work, and concrete blockers in one brief.',
    stars: 1240,
    installs: 6200,
    firstSeen: '2026-09-22',

    team: false,
    agents: [
      {
        name: 'daily-brief',
        title: 'Daily project brief',
        prompt:
          'Read recent commits, repository instructions, and working copy changes. Summarize progress, unfinished work, and blockers. Include source references. Do not edit files or send messages.',
        schedule: { type: 'interval', everyMs: 86400000 },
      },
    ],
  },
  {
    slug: 'issue-triage',
    title: 'Issue triage',
    source: 'example-tools/issue-triage',
    description: 'Turn incoming bug reports into reproducible cases and clearly scoped work.',
    stars: 986,
    installs: 4100,
    firstSeen: '2026-10-02',

    team: true,
    agents: [
      {
        name: 'triage-lead',
        title: 'Triage lead',
        prompt:
          'Read the assigned bug report and repository instructions. Identify the expected behavior, reproduce the symptom, and propose a focused implementation task. Do not publish or edit issues.',
        schedule: { type: 'manual' },
      },
      tester,
    ],
  },
  {
    slug: 'documentation',
    title: 'Documentation studio',
    source: 'example-tools/docs-studio',
    description:
      'Keep guides accurate as the code changes, with an editor and a source researcher.',
    stars: 742,
    installs: 2800,
    firstSeen: '2026-10-08',

    team: true,
    agents: [
      {
        name: 'editor',
        title: 'Documentation editor',
        prompt:
          'Compare documentation with the current source. Update the assigned guide using verified file references and runnable commands. Follow the repository writing conventions.',
        schedule: { type: 'manual' },
      },
      {
        name: 'researcher',
        title: 'Source researcher',
        prompt:
          'Trace the feature through its implementation. Report its entry points, behavior, constraints, and verification commands with file references. Do not edit files.',
        schedule: { type: 'manual' },
      },
    ],
  },
  {
    slug: 'release-readiness',
    title: 'Release readiness',
    source: 'example-tools/release-ops',
    description:
      'Check release blockers and prepare a weekly readiness report with supporting evidence.',
    stars: 518,
    installs: 1700,
    firstSeen: '2026-10-16',

    team: false,
    agents: [
      {
        name: 'release-check',
        title: 'Release readiness check',
        prompt:
          'Read the release checklist, current changes, and relevant test results. Report release blockers and missing verification. Do not create tags, publish releases, or deploy.',
        schedule: { type: 'interval', everyMs: 604800000 },
      },
    ],
  },
];

function factoryExamples(factory: ExampleFactory): MarketplaceExample[] {
  const files: Record<string, string> = {
    'factory.yaml':
      JSON.stringify(
        {
          schemaVersion: 'v1alpha1',
          name: factory.title,
          repositories: [],
          agentDefaults: { model: 'auto' },
        },
        null,
        2,
      ) + '\n',
  };
  for (const agent of factory.agents) {
    files[`agents/${agent.name}/agent.md`] =
      `---\n${JSON.stringify({ id: `${factory.slug}/${agent.name}`, description: agent.title, enabled: false, runtimeMode: 'approval-required', schedule: agent.schedule }, null, 2)}\n---\n\n${agent.prompt}\n`;
  }
  const lead = factory.agents[0];
  if (factory.team && lead) {
    files[`teams/${factory.slug}/team.yaml`] =
      JSON.stringify(
        {
          schemaVersion: 'v1alpha1',
          name: factory.title,
          description: factory.description,
          instructions: './instructions.md',
          lead: lead.name,
          members: Object.fromEntries(
            factory.agents.map((agent) => [
              agent.name,
              {
                agent: `agents/${agent.name}/agent.md`,
                ...(agent.name !== lead.name ? { reportsTo: lead.name } : {}),
              },
            ]),
          ),
        },
        null,
        2,
      ) + '\n';
    files[`teams/${factory.slug}/instructions.md`] =
      `# ${factory.title}\n\nFollow the repository instructions. Keep findings concrete and include source references. The lead coordinates work and collects the final report.\n`;
  }
  const base = {
    source: factory.source,
    url: null,
    stars: factory.stars,
    installs: factory.installs,
    firstSeen: factory.firstSeen,
  };
  const entries: MarketplaceExample[] = [
    {
      ...base,
      kind: 'factory',
      name: 'factory',
      slug: factory.slug,
      title: factory.title,
      description: factory.description,
      files,
      agentCount: factory.agents.length,
      teamCount: factory.team ? 1 : 0,
    },
  ];
  for (const agent of factory.agents) {
    const path = `agents/${agent.name}/agent.md`;
    const entry = {
      ...base,
      kind: 'agent',
      name: agent.name,
      slug: `${factory.slug}-${agent.name}`,
      title: agent.title,
      description: agent.prompt,
      files: { 'factory.yaml': files['factory.yaml'] ?? '', [path]: files[path] ?? '' },
      agentCount: 1,
      teamCount: 0,
    } satisfies MarketplaceExample;
    entries.push(entry);
    if (agent.schedule.type !== 'manual') {
      entries.push({ ...entry, kind: 'automation' });
    }
  }
  if (factory.team) {
    entries.push({
      ...base,
      kind: 'team',
      name: factory.slug,
      slug: factory.slug,
      title: factory.title.endsWith('team') ? factory.title : `${factory.title} team`,
      description: factory.description,
      files,
      agentCount: factory.agents.length,
      teamCount: 1,
    });
  }
  return entries;
}
export const marketplaceExamples = examples.flatMap(factoryExamples);

export function marketplaceExampleCommand(
  entry: Pick<MarketplaceEntry, 'source' | 'kind' | 'name'>,
) {
  return `openfactory factory add https://github.com/${entry.source}${entry.kind === 'factory' ? '' : ` --${entry.kind} ${entry.name}`}`;
}
