import { agentSchema, deliverySchema, type AgentAppearance } from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { t3Rpc } from './t3-rpc';
import { readAppearances, readFactoryProfiles } from './factory-store';

export const getAgents = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const [rawTasks, rawShell] = await Promise.all([
      t3Rpc('scheduledTasks.list', {}),
      t3Rpc('orchestration.subscribeShell', {}),
    ]);
    const tasks = z.object({ tasks: z.array(agentSchema) }).parse(rawTasks);
    const shell = z
      .object({
        snapshot: z.object({
          projects: z.array(
            z.object({ id: z.string(), title: z.string(), workspaceRoot: z.string() }),
          ),
        }),
      })
      .parse(rawShell);
    const profiles = await readFactoryProfiles(
      shell.snapshot.projects.map((project) => project.id),
    );
    const projects = shell.snapshot.projects.map((project) => ({
      ...project,
      title: profiles[project.id]?.title ?? project.title,
      icon:
        profiles[project.id]?.icon ?? ({ kind: 'icon', name: 'factory' } satisfies AgentAppearance),
    }));
    const agents = tasks.tasks.map((task) => {
      const project = projects.find((p) => p.id === task.projectId);
      return {
        ...task,
        projectName: project?.title ?? 'Unassigned',
        projectPath: project?.workspaceRoot ?? null,
      };
    });
    return {
      agents,
      projects,
      appearances: await readAppearances(agents.map((agent) => agent.id)),
      connected: true,
      error: null,
      syncedAt: new Date().toISOString(),
    };
  } catch {
    return {
      agents: [],
      projects: [],
      appearances: await readAppearances([]),
      connected: false,
      error: 'T3 Code is unavailable. Check its server and connection settings.',
      syncedAt: null,
    };
  }
});
export const agentAction = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1), action: z.enum(['run', 'pause', 'resume']) }))
  .handler(async ({ data }) => {
    const result = await t3Rpc(
      data.action === 'run' ? 'scheduledTasks.runNow' : 'scheduledTasks.setEnabled',
      data.action === 'run' ? { id: data.id } : { id: data.id, enabled: data.action === 'resume' },
    );
    return z.object({ task: agentSchema }).parse(result).task;
  });
export const getDeliveries = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(
    async ({ data }) =>
      z.object({ deliveries: z.array(deliverySchema) }).parse(
        await t3Rpc('scheduledTasks.listWebhookDeliveries', {
          id: data.id,
          acceptAnyOutcome: true,
        }),
      ).deliveries,
  );

export const createAgent = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      title: z.string().trim().min(1).max(120),
      prompt: z.string().trim().min(1).max(16000),
      sourceId: z.string().min(1),
      projectId: z.string().min(1).optional(),
      trigger: z.enum(['interval', 'fixed_time', 'webhook']),
      minutes: z.number().int().min(1).max(525600),
      timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }),
  )
  .handler(async ({ data }) => {
    const raw = z
      .object({ tasks: z.array(z.record(z.string(), z.unknown())) })
      .parse(await t3Rpc('scheduledTasks.list', {}));
    const result = z.object({ tasks: z.array(agentSchema) }).parse(raw);
    const source = result.tasks.find((task) => task.id === data.sourceId);
    if (!source) {
      throw new Error('The selected runtime is no longer available. Refresh and try again.');
    }
    if (data.projectId) {
      const shell = z
        .object({ snapshot: z.object({ projects: z.array(z.object({ id: z.string() })) }) })
        .parse(await t3Rpc('orchestration.subscribeShell', {}));
      if (!shell.snapshot.projects.some((project) => project.id === data.projectId)) {
        throw new Error('This factory no longer exists. Refresh and try again.');
      }
    }
    const schedule =
      data.trigger === 'interval'
        ? { type: 'interval', everyMs: data.minutes * 60_000 }
        : data.trigger === 'fixed_time'
          ? { type: 'fixed_time', timeOfDay: data.timeOfDay }
          : { type: 'webhook' };
    // Copy the complete runtime settings from the server, never trust a browser-supplied runtime mode.
    const original = raw.tasks.find((task) => task.id === source.id)!;
    const saved = await t3Rpc('scheduledTasks.upsert', {
      title: data.title,
      prompt: data.prompt,
      enabled: false,
      schedule,
      projectId: data.projectId ?? source.projectId,
      threadId: null,
      workspaceStrategy: { type: 'root' },
      modelSelection: original.modelSelection,
      runtimeMode: original.runtimeMode,
      interactionMode: original.interactionMode,
    });
    return z.object({ task: agentSchema }).parse(saved).task;
  });
