import { z } from 'zod';
import { listMachines } from './machines';
import { readFleet, reportFleet } from './fleet';
import { reportInputSchema } from './report';

export async function createOpenFactoryMcpServer(directory: string, port: number) {
  process.env.MCP_USE_ANONYMIZED_TELEMETRY = 'false';
  const { MCPServer, object, InMemorySessionStore } = await import('mcp-use/server');
  const origin = `http://127.0.0.1:${port}`;
  const server = new MCPServer({
    name: 'openfactory',
    version: '0.1.0',
    description:
      'Read-only access to all paired OpenFactory runners, their factories, agents and retained run history.',
    instructions:
      'Use report_runs for counts, never count its paginated runs array. Weekly periods start Monday in Europe/Paris unless a timeZone is supplied. State the date range and that each execution turn counts separately. Call list_machines to discover runners. report_runs defaults to all paired runners; use machine for one runner such as Dell. Never present knownTotal as a complete count when complete is false.',
    stateless: true,
    sessionStore: new InMemorySessionStore(),
    host: '127.0.0.1',
    allowedOrigins: [origin, `http://localhost:${port}`],
    cors: { origin: [origin, `http://localhost:${port}`] },
  });
  server.app.use('*', async (context, next) => {
    const requestOrigin = context.req.header('origin');
    if (requestOrigin && requestOrigin !== origin && requestOrigin !== `http://localhost:${port}`) {
      return context.json({ error: 'Origin is not allowed.' }, 403);
    }
    await next();
  });
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  server.app.get('/health', (context) => context.json({ status: 'ok', server: 'openfactory-mcp' }));
  server.tool(
    {
      name: 'list_machines',
      description:
        'List this computer and every runner paired in the desktop app, with machine ID, name, address, and live connection status. Credentials are never returned. Open the desktop app to reach encrypted pairings.',
      schema: z.object({}),
      annotations,
    },
    async () => object(await listMachines(directory)),
  );
  server.tool(
    {
      name: 'list_factories',
      description:
        'List factories across all paired runners, with machine IDs, factory IDs and workspace paths. Unavailable runners are identified.',
      schema: z.object({ machine: z.string().optional() }),
      annotations,
    },
    async ({ machine }) => {
      const fleet = await readFleet(directory, machine);
      return object({
        factories: fleet.flatMap((entry) =>
          entry.status === 'available'
            ? entry.history.projects.map((project) => ({
                ...project,
                machineId: entry.id,
                machineName: entry.name,
              }))
            : [],
        ),
        machines: fleet.map((entry) => ({
          id: entry.id,
          name: entry.name,
          status: entry.status,
          error: entry.status === 'unavailable' ? entry.error : null,
        })),
      });
    },
  );
  server.tool(
    {
      name: 'list_agents',
      description:
        'List OpenFactory agents across paired runners with their IDs, factory IDs, schedules and enabled state.',
      schema: z.object({ project: z.string().optional(), machine: z.string().optional() }),
      annotations,
    },
    async ({ project, machine }) => {
      const fleet = await readFleet(directory, machine);
      return object({
        agents: fleet.flatMap((entry) =>
          entry.status === 'available'
            ? entry.history.agents
                .filter(
                  (agent) =>
                    !project ||
                    agent.projectId === project ||
                    entry.history.projects.some(
                      (item) => item.id === agent.projectId && item.workspaceRoot === project,
                    ),
                )
                .map((agent) => ({
                  id: agent.id,
                  title: agent.title,
                  projectId: agent.projectId,
                  enabled: agent.enabled,
                  schedule: agent.schedule,
                  lastRunAt: agent.lastRunAt,
                  machineId: entry.id,
                  machineName: entry.name,
                }))
            : [],
        ),
        machines: fleet.map((entry) => ({
          id: entry.id,
          name: entry.name,
          status: entry.status,
          error: entry.status === 'unavailable' ? entry.error : null,
        })),
      });
    },
  );
  server.tool(
    {
      name: 'report_runs',
      description:
        'Count ALL retained OpenFactory execution turns for this_week, last_week, or a custom date range. Includes imported agent history and deduplicates run IDs. Returns exact total and breakdowns by status, local day and factory, plus a paginated list of run metadata. Counts use requestedAt, including queued and failed turns. sinceDay is inclusive; untilDay is exclusive. Defaults to this_week in Europe/Paris. Use total for counts, even when runs has fewer entries. Defaults to all paired runners; filter machine by ID or exact name. complete=false and total=null mean some runners could not be read; knownTotal is only the available subset.',
      schema: reportInputSchema,
      annotations,
    },
    async (input) => object(await reportFleet(directory, input)),
  );
  return server;
}
