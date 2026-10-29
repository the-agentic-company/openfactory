import { randomUUID } from 'node:crypto';
import { agentSchema, deliverySchema, type AgentAppearance } from '@openfactory/core';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';
import { readAppearances, readFactoryProfiles } from './factory-store';
import { nativeConnection } from './native-runtime.server';

export const getAgents = createServerFn({ method: 'GET' }).handler(async () => {
  const connection = await nativeConnection();
  const native = Boolean(connection);
  const cacheScope = connection?.origin ?? 'local';
  try {
    const [rawTasks, rawShell] = await Promise.all([
      runtimeRpc('agents.list', {}),
      runtimeRpc('workspace.snapshot', {}),
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
      native,
      cacheScope,
      error: null,
      syncedAt: new Date().toISOString(),
    };
  } catch {
    return {
      agents: [],
      projects: [],
      appearances: await readAppearances([]),
      connected: false,
      native,
      cacheScope,
      error: 'The runtime is unavailable. Check the selected computer in Settings.',
      syncedAt: null,
    };
  }
});
export const agentAction = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().min(1), action: z.enum(['run', 'pause', 'resume']) }))
  .handler(async ({ data }) => {
    const result = await runtimeRpc(
      data.action === 'run' ? 'agents.run' : 'agents.setEnabled',
      data.action === 'run'
        ? { id: data.id, requestId: randomUUID() }
        : { id: data.id, enabled: data.action === 'resume' },
    );
    return z.object({ task: agentSchema }).parse(result).task;
  });
export const getDeliveries = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(
    async ({ data }) =>
      z.object({ deliveries: z.array(deliverySchema) }).parse(
        await runtimeRpc('agents.deliveries', {
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
      projectId: z.string().min(1).optional(),
      workspaceRoot: z.string().min(1).optional(),
      provider: z.enum(['codex', 'claude-code']),
      model: z.string().trim().min(1),
      runtimeMode: z.enum(['approval-required', 'auto-accept-edits', 'full-access']),
      trigger: z.enum(['manual', 'interval', 'fixed_time', 'webhook']),
      minutes: z.number().int().min(1).max(525600),
      timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }),
  )
  .handler(async ({ data }) => {
    let projectId = data.projectId;
    if (!projectId) {
      if (!data.workspaceRoot) {
        throw new Error('Choose a working directory for this factory.');
      }
      const project = z.object({ id: z.string() }).parse(
        await runtimeRpc('projects.upsert', {
          id: data.workspaceRoot,
          title: data.workspaceRoot.split('/').filter(Boolean).at(-1) ?? data.workspaceRoot,
          workspaceRoot: data.workspaceRoot,
        }),
      );
      projectId = project.id;
    }
    const schedule =
      data.trigger === 'manual'
        ? { type: 'manual' }
        : data.trigger === 'interval'
          ? { type: 'interval', everyMs: data.minutes * 60000 }
          : data.trigger === 'fixed_time'
            ? { type: 'fixed_time', timeOfDay: data.timeOfDay }
            : { type: 'webhook' };
    const result = await runtimeRpc('agents.upsert', {
      title: data.title,
      prompt: data.prompt,
      projectId,
      schedule,
      enabled: false,
      modelSelection: { instanceId: data.provider, model: data.model },
      runtimeMode: data.runtimeMode,
      interactionMode: 'default',
      workspaceStrategy: { type: 'root' },
    });
    return z.object({ task: agentSchema }).parse(result).task;
  });
