import { z } from 'zod';

export const categories = ['All', 'Foundation', 'Frontend', 'Backend', 'Quality'] as const;
export type Category = (typeof categories)[number];
export const categorySchema = z.enum(categories);

export const stack = [
  {
    name: 'pnpm',
    category: 'Foundation',
    role: 'Package management',
    detail: 'One lockfile, workspace protocols and pinned package manager.',
  },
  {
    name: 'Vite+',
    category: 'Foundation',
    role: 'Unified toolchain',
    detail: 'Development, builds, tests, formatting, linting and workspace tasks.',
  },
  {
    name: 'TypeScript',
    category: 'Foundation',
    role: 'Shared type system',
    detail: 'Strict configuration shared across every workspace package.',
  },
  {
    name: 'React',
    category: 'Frontend',
    role: 'Interface',
    detail: 'Component-based UI with server rendering and hydration.',
  },
  {
    name: 'TanStack Start',
    category: 'Frontend',
    role: 'Full-stack framework',
    detail: 'Server rendering and typed server functions, without a separate RPC layer.',
  },
  {
    name: 'TanStack Router',
    category: 'Frontend',
    role: 'Routing',
    detail: 'File-based routes, typed navigation and route loaders.',
  },
  {
    name: 'TanStack Query',
    category: 'Frontend',
    role: 'Server state',
    detail: 'Request caching, refresh and async state. Powers this workspace snapshot.',
  },
  {
    name: 'TanStack Table',
    category: 'Frontend',
    role: 'Data tables',
    detail: 'Headless row models. Powers the stack inventory below.',
  },
  {
    name: 'TanStack Virtual',
    category: 'Frontend',
    role: 'Virtualization',
    detail: 'Windowed rendering for large lists and tables.',
  },
  {
    name: 'Tailwind CSS',
    category: 'Frontend',
    role: 'Styling',
    detail: 'Vite-integrated styles with reusable design tokens.',
  },
  {
    name: 'Zustand',
    category: 'Frontend',
    role: 'Client state',
    detail: 'Small, explicit stores for interface state.',
  },
  { name: 'Lucide', category: 'Frontend', role: 'Icons', detail: 'One consistent icon family.' },
  {
    name: 'Zod',
    category: 'Backend',
    role: 'Boundary validation',
    detail: 'Validates server function input and shared domain values.',
  },
  {
    name: 'Effect',
    category: 'Backend',
    role: 'Server workflows',
    detail: 'Available in core for typed effects and resource management.',
  },
  {
    name: 'Drizzle + PostgreSQL',
    category: 'Backend',
    role: 'Persistence',
    detail: 'Schema and lazy connection factory prepared; database connection is optional.',
  },
  {
    name: 'Nitro',
    category: 'Backend',
    role: 'Production server',
    detail: 'Builds the application into a standalone Node server.',
  },
  {
    name: 'Oxlint',
    category: 'Quality',
    role: 'Lint + type checks',
    detail: 'Managed by Vite+ with type-aware checks enabled.',
  },
  {
    name: 'Oxfmt',
    category: 'Quality',
    role: 'Formatting',
    detail: 'Managed by Vite+ from the root configuration.',
  },
  {
    name: 'Vitest',
    category: 'Quality',
    role: 'Tests',
    detail: 'Managed by Vite+; shared domain tests run from the workspace root.',
  },
] satisfies { name: string; category: Category; role: string; detail: string }[];

export function selectStack(input: unknown) {
  const category = categorySchema.parse(input);
  return category === 'All' ? stack : stack.filter((item) => item.category === category);
}

export const workspacePackages = [
  { path: 'apps/web', name: '@openfactory/web', purpose: 'Application and server functions' },
  {
    path: 'packages/core',
    name: '@openfactory/core',
    purpose: 'Shared domain logic and validation',
  },
  {
    path: 'packages/config',
    name: '@openfactory/config',
    purpose: 'Shared policy and TypeScript defaults',
  },
  {
    path: 'packages/db',
    name: '@openfactory/db',
    purpose: 'Database schema and connection factory',
  },
];

export * from './agents';
export * from './history';

export {
  parseTeamYaml,
  teamSchema,
  agentFilePathSchema,
  teamFilePathSchema,
  factoryTeamSetups,
  resolveTeam,
  resolvedTeamSchema,
  teamSetupSchema,
  stringifyTeamDefinition,
  teamGuidance,
  type TeamDefinition,
  type TeamSetup,
  type AgentTeam,
  type TeamAgent,
} from './team';
export { workspaceViews, agentAppearanceSchema, scorerSchema, scoreOutput } from './factory';
export type { WorkspaceView, AgentAppearance, Scorer } from './factory';
export { agentDefinition, agentDirectory, parseAgentDefinition } from './agent-definition';
export {
  createFactoryFiles,
  validateFactoryFile,
  factoryYamlSchema,
  updateFactoryYaml,
} from './factory-definition';

export { iconColorNames, firstEmoji, monogramSchema, type IconColor } from './appearance';

export { runBucket, relativeRunTime, runLinks, type RunBucket } from './run-view';
export { pullRequestResultSchema, type PullRequestResult } from './pull-requests';
export { pullRequestSnapshotSchema, type PullRequestSnapshot } from './pull-requests';
export * from './marketplace';
