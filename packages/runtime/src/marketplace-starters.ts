const factory = (name: string) =>
  `schemaVersion: v1alpha1\nname: ${name}\nrepositories: []\nagentDefaults:\n  model: auto\n`;
const agent = (id: string, title: string, prompt: string, schedule = 'type: manual') =>
  `---\nid: ${id}\ndescription: ${title}\nenabled: false\nruntimeMode: approval-required\nschedule:\n  ${schedule.replaceAll('\n', '\n  ')}\n---\n\n${prompt}\n`;

export const marketplaceStarters: {
  source: string;
  title: string;
  description: string;
  files: Record<string, string>;
}[] = [
  {
    source: 'openfactory/code-review',
    title: 'Code review',
    description: 'A reviewer and a test specialist working as a team.',
    files: {
      'factory.yaml': factory('Code review'),
      'agents/reviewer/agent.md': agent(
        'reviewer',
        'Code reviewer',
        'Review the current changes against the repository instructions. Trace changed behavior through its callers, identify concrete bugs, and report findings with file locations and reproduction steps. Do not modify files or publish comments.',
      ),
      'agents/test-specialist/agent.md': agent(
        'test-specialist',
        'Test specialist',
        'Inspect the current changes and run the relevant existing checks. Identify missing behavior coverage and report failures with the exact commands and output. Do not modify files.',
      ),
      'teams/code-review/team.yaml':
        'schemaVersion: v1alpha1\nname: Code review\ndescription: Review behavior and verify changes.\nlead: reviewer\nmembers:\n  reviewer:\n    agent: agents/reviewer/agent.md\n  tester:\n    agent: agents/test-specialist/agent.md\n    reportsTo: reviewer\n',
    },
  },
  {
    source: 'openfactory/daily-brief',
    title: 'Daily brief',
    description: 'A scheduled summary of repository changes and unfinished work.',
    files: {
      'factory.yaml': factory('Daily brief'),
      'agents/daily-brief/agent.md': agent(
        'daily-brief',
        'Daily brief',
        'Read the repository instructions, recent commits, and working copy changes. Summarize progress, unfinished work, and concrete blockers. Include links or file paths supporting each finding. Do not edit files or send messages.',
        'type: interval\neveryMs: 86400000',
      ),
    },
  },
  {
    source: 'openfactory/repository-guide',
    title: 'Repository guide',
    description: 'An on-demand guide to a repository’s architecture and conventions.',
    files: {
      'factory.yaml': factory('Repository guide'),
      'agents/repository-guide/agent.md': agent(
        'repository-guide',
        'Repository guide',
        'Read the repository instructions and map the project structure, entry points, data flow, and verification commands. Answer using concrete source references. Do not edit files.',
      ),
    },
  },
];
