import { readReportingHistory } from '@openfactory/runtime/reporting';
import { hostname } from 'node:os';
import { pairedMachines, readMachineHistory } from './machines';
import { reportInputSchema, reportRuns } from './report';

type History = ReturnType<typeof readReportingHistory>;
export async function readFleet(directory: string, machine?: string) {
  const candidates = [
    { id: 'local', name: hostname(), read: async () => readReportingHistory(directory) },
    ...(await pairedMachines()).map((entry) => ({
      ...entry,
      read: () => readMachineHistory(entry),
    })),
  ];
  const selected = candidates.filter(
    (entry) =>
      !machine || entry.id === machine || entry.name.toLowerCase() === machine.toLowerCase(),
  );
  if (!selected.length) {
    throw new Error(`Unknown machine: ${machine}. Call list_machines first.`);
  }
  if (machine && selected.length > 1) {
    throw new Error('Machine name is ambiguous. Use its ID from list_machines.');
  }
  return Promise.all(
    selected.map(async ({ id, name, read }) => {
      try {
        return { id, name, status: 'available' as const, history: await read() };
      } catch (error) {
        return {
          id,
          name,
          status: 'unavailable' as const,
          error: error instanceof Error ? error.message : 'Runner unavailable.',
        };
      }
    }),
  );
}

export async function reportFleet(directory: string, raw: unknown) {
  const input = reportInputSchema.parse(raw);
  const fleet = await readFleet(directory, input.machine);
  const now = new Date();
  const history: History = { projects: [], agents: [], runs: [] };
  const runs = new Map<
    string,
    History['runs'][number] & {
      machineId: string;
      machineName: string;
      originalProjectId: string | null;
    }
  >();
  const byMachine = [];
  let matchedProject = !input.project;
  let matchedAgent = !input.agentId;
  for (const entry of fleet) {
    if (entry.status === 'unavailable') {
      byMachine.push({
        machineId: entry.id,
        machineName: entry.name,
        status: entry.status,
        total: null,
        error: entry.error,
      });
      continue;
    }
    const projects = entry.history.projects.filter(
      (project) =>
        !input.project || project.id === input.project || project.workspaceRoot === input.project,
    );
    if (projects.length) {
      matchedProject = true;
    }
    if (entry.history.agents.some((agent) => agent.id === input.agentId)) {
      matchedAgent = true;
    }
    const projectIds = new Set(projects.map((project) => project.id));
    const selected = {
      ...entry.history,
      projects,
      runs: entry.history.runs.filter(
        (run) =>
          (!input.project || (run.projectId !== null && projectIds.has(run.projectId))) &&
          (!input.agentId || run.agentId === input.agentId),
      ),
    };
    const report = reportRuns(selected, { ...input, project: undefined, agentId: undefined }, now);
    byMachine.push({
      machineId: entry.id,
      machineName: entry.name,
      status: entry.status,
      total: report.total,
      error: null,
    });
    history.projects.push(
      ...projects.map((project) => ({ ...project, id: `${entry.id}:${project.id}` })),
    );
    history.agents.push(...entry.history.agents);
    for (const run of selected.runs) {
      const previous = runs.get(run.id);
      if (!previous || (previous.source !== 'openfactory' && run.source === 'openfactory')) {
        runs.set(run.id, {
          ...run,
          projectId: run.projectId === null ? null : `${entry.id}:${run.projectId}`,
          originalProjectId: run.projectId,
          machineId: entry.id,
          machineName: entry.name,
        });
      }
    }
  }
  const complete = fleet.every((entry) => entry.status === 'available');
  if (complete && !matchedProject) {
    throw new Error(`Unknown factory: ${input.project}. Call list_factories first.`);
  }
  if (complete && !matchedAgent) {
    throw new Error(`Unknown agent: ${input.agentId}. Call list_agents first.`);
  }
  history.runs = [...runs.values()];
  const report = reportRuns(history, { ...input, project: undefined, agentId: undefined }, now);
  return {
    ...report,
    scope:
      'Selected paired runners and this computer. Run IDs are deduplicated across machines, preferring native records over imported copies.',
    complete,
    total: complete ? report.total : null,
    knownTotal: report.total,
    warning: complete
      ? null
      : 'Some runners could not be read. knownTotal covers available runners only; the fleet total is unknown.',
    byMachineCounting:
      'Per-machine totals count each machine’s retained history and may overlap for copied run IDs. The overall total deduplicates those IDs.',
    byMachine,
    byFactory: report.byFactory.map((item) => {
      const runner = fleet.find((entry) => item.projectId.startsWith(`${entry.id}:`));
      return {
        ...item,
        machineId: runner?.id ?? null,
        projectId: runner ? item.projectId.slice(runner.id.length + 1) : item.projectId,
      };
    }),
    runs: report.runs.map((run) => {
      const original = runs.get(run.id);
      return { ...run, projectId: original?.originalProjectId ?? null };
    }),
  };
}
