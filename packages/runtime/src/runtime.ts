import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import {
  agentDefinition,
  deliverySchema,
  threadHistorySchema,
  resolveTeam,
  teamSetupSchema,
  teamGuidance,
} from '@openfactory/core';
import { z } from 'zod';
import {
  importSchema,
  messageSchema,
  ownedAgentSchema,
  projectSchema,
  runSchema,
  sendSchema,
  sessionSchema,
  upsertSchema,
  type OwnedAgent,
  type Session,
} from './contracts';
import { Store } from './store';
import { nextScheduledAt } from './schedule';
import { launchProvider } from './providers';

const idInput = z.object({ id: z.string().min(1) });
const receiptSchema = z.object({ runId: z.string(), threadId: z.string(), digest: z.string() });
const secretSchema = z.object({ token: z.string(), signatureSecret: z.string().nullable() });
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const storedTeamSchema = teamSetupSchema.extend({ projectId: z.string() });
const teamKey = (projectId: string, path: string) => JSON.stringify([projectId, path]);
const capacityFailure = (error: string | null) =>
  /selected model is at capacity/i.test(error ?? '');
const capacityDelayMs = 5 * 60 * 1000;
const now = () => new Date().toISOString();
const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
export class AgentRuntime {
  readonly store: Store;
  private active = new Map<string, { runId: string; stop: () => void }>();
  private working = new Set<string>();
  private workingAgents = new Set<string>();
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(readonly directory: string) {
    this.store = new Store(directory);
    mkdirSync(join(directory, 'events'), { recursive: true, mode: 0o700 });
    for (const run of this.store.all('runs', runSchema)) {
      if (run.status === 'running') {
        this.store.put('runs', run.id, {
          ...run,
          status: 'interrupted',
          completedAt: now(),
          error: 'The runtime stopped before this turn finished. It was not retried.',
        });
        const agent = this.getAgent(run.agentId);
        this.store.put('agents', agent.id, {
          ...agent,
          lastRunStatus: 'failed',
          lastRunError: 'Run interrupted by runtime restart.',
        });
      }
    }
  }
  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }
  async close() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const worker of this.active.values()) {
      worker.stop();
    }
    while (this.working.size) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    this.store.close();
  }
  getAgent(id: string) {
    const agent = this.store.get('agents', id, ownedAgentSchema);
    if (!agent) {
      throw new Error('This agent no longer exists.');
    }
    return agent;
  }
  private getSession(id: string) {
    const session = this.store.get('sessions', id, sessionSchema);
    if (!session) {
      throw new Error(
        'This conversation is archived or does not exist. Start a new run to continue.',
      );
    }
    return session;
  }
  private publicAgent(agent: OwnedAgent) {
    if (agent.schedule.type !== 'webhook') {
      return { ...agent, webhook: undefined };
    }
    const secret = this.store.get('secrets', agent.id, secretSchema);
    const origin = (process.env.OPENFACTORY_PUBLIC_URL ?? 'http://localhost:8018').replace(
      /\/$/,
      '',
    );
    return {
      ...agent,
      webhook: {
        url: secret
          ? `${origin}/api/webhooks/${encodeURIComponent(agent.id)}/${secret.token}`
          : null,
        hasSecret: Boolean(secret?.signatureSecret),
      },
    };
  }
  private createSession(agent: OwnedAgent): Session {
    const project = this.store.get('projects', agent.projectId, projectSchema);
    if (!project) {
      throw new Error('This factory no longer exists.');
    }
    if (agent.workspaceStrategy.type === 'root' && agent.workspaceStrategy.branch) {
      const branch = execFileSync('git', ['branch', '--show-current'], {
        cwd: project.workspaceRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim();
      if (branch !== agent.workspaceStrategy.branch) {
        throw new Error('The shared checkout is on another branch. Choose a worktree instead.');
      }
    }
    const id = randomUUID();
    const session = sessionSchema.parse({
      thread: {
        id,
        title: agent.title,
        projectId: agent.projectId,
        createdAt: now(),
        runtime: 'openfactory',
        agentId: agent.id,
      },
      nativeSessionId: null,
      cwd:
        agent.workspaceStrategy.type === 'existing_worktree'
          ? agent.workspaceStrategy.worktreePath
          : project.workspaceRoot,
      modelSelection: agent.modelSelection,
      runtimeMode: agent.runtimeMode,
      interactionMode: agent.interactionMode,
      workspaceStrategy: agent.workspaceStrategy,
    });
    this.store.put('sessions', id, session);
    return session;
  }
  private projectTeams(projectId: string) {
    const agents = this.store
      .all('agents', ownedAgentSchema)
      .filter((agent) => agent.projectId === projectId);
    return this.store
      .all('teams', storedTeamSchema)
      .filter((team) => team.projectId === projectId)
      .map((team) => resolveTeam(team, agents));
  }
  private teamPrompt(agent: OwnedAgent, text: string) {
    const guidance = this.projectTeams(agent.projectId).flatMap((team) => {
      const member = team.agents.find((item) => item.agent.id === agent.id);
      return member ? [teamGuidance(team, member.id)] : [];
    });
    return guidance.length ? `${guidance.join('\n\n')}\n\nAgent task:\n${text}` : text;
  }
  private enqueue(
    agent: OwnedAgent,
    text: string,
    key: string,
    source: 'schedule' | 'webhook' | 'web' | 'retry',
    threadId?: string,
  ) {
    const fingerprint = digest(JSON.stringify([agent.id, threadId ?? null, text]));
    const previous = this.store.get('receipts', key, receiptSchema);
    if (previous) {
      if (previous.digest !== fingerprint) {
        throw new Error('This request ID was already used with different content.');
      }
      return previous;
    }
    const session = threadId ? this.getSession(threadId) : this.createSession(agent);
    if (session.thread.agentId !== agent.id) {
      throw new Error('This conversation belongs to another agent.');
    }
    const timestamp = now();
    const runId = randomUUID();
    const messageId = `openfactory-message:${runId}`;
    const ordinal =
      this.store.all('runs', runSchema).filter((run) => run.threadId === session.thread.id).length +
      1;
    this.store.put(
      'runs',
      runId,
      runSchema.parse({
        id: runId,
        agentId: agent.id,
        threadId: session.thread.id,
        ordinal,
        userMessageId: messageId,
        status: 'queued',
        requestedAt: timestamp,
        startedAt: null,
        completedAt: null,
        modelSelection: session.modelSelection,
        error: null,
        usage: null,
      }),
    );
    this.store.put(
      'messages',
      messageId,
      messageSchema.parse({
        id: messageId,
        runId,
        scheduledTaskId: agent.id,
        createdBy: source === 'web' ? 'user' : 'automation',
        creationSource: source,
        role: 'user',
        text: threadId ? text : this.teamPrompt(agent, text),
        createdAt: timestamp,
      }),
    );
    const receipt = { runId, threadId: session.thread.id, digest: fingerprint };
    this.store.put('receipts', key, receipt);
    this.store.put('agents', agent.id, {
      ...agent,
      threadId: session.thread.id,
      runCount: agent.runCount + 1,
    });
    return receipt;
  }
  tick(at = new Date()) {
    if (this.stopped) {
      return;
    }
    for (const agent of this.store.all('agents', ownedAgentSchema)) {
      if (!agent.enabled || !agent.nextRunAt || new Date(agent.nextRunAt) > at) {
        continue;
      }
      try {
        this.store.transaction(() => {
          this.enqueue(agent, agent.prompt, `schedule:${agent.id}:${agent.nextRunAt}`, 'schedule');
          this.store.put('agents', agent.id, {
            ...this.getAgent(agent.id),
            nextRunAt: nextScheduledAt(agent.schedule, at),
          });
        });
      } catch (error) {
        this.store.put('agents', agent.id, {
          ...agent,
          enabled: false,
          nextRunAt: null,
          lastRunStatus: 'failed',
          lastRunError:
            error instanceof Error ? error.message : 'Could not prepare the scheduled session.',
        });
      }
    }
    const runs = this.store.all('runs', runSchema);
    for (const run of runs) {
      if (
        run.status !== 'failed' ||
        !capacityFailure(run.error) ||
        (run.capacityRetry && run.capacityRetry.status !== 'pending')
      ) {
        continue;
      }
      const agent = this.getAgent(run.agentId);
      const superseded =
        agent.threadId !== run.threadId ||
        runs.some((other) => other.threadId === run.threadId && other.ordinal > run.ordinal);
      if (!agent.enabled || superseded) {
        this.store.put('runs', run.id, { ...run, capacityRetry: { status: 'cancelled' } });
        continue;
      }
      const retryAt =
        run.capacityRetry?.at ??
        new Date(
          new Date(run.completedAt ?? run.requestedAt).getTime() + capacityDelayMs,
        ).toISOString();
      if (new Date(retryAt) > at) {
        if (!run.capacityRetry) {
          this.store.put('runs', run.id, {
            ...run,
            capacityRetry: { status: 'pending', at: retryAt },
          });
        }
        continue;
      }
      const session = this.getSession(run.threadId);
      const original = this.store.get('messages', run.userMessageId, messageSchema);
      const prompt = session.nativeSessionId ? 'continue' : original?.text;
      if (!prompt) {
        this.store.put('runs', run.id, { ...run, capacityRetry: { status: 'cancelled' } });
        continue;
      }
      this.store.transaction(() => {
        const receipt = this.enqueue(
          agent,
          prompt,
          `capacity-retry:${run.id}`,
          'retry',
          run.threadId,
        );
        this.store.put('runs', run.id, {
          ...run,
          capacityRetry: { status: 'continued', runId: receipt.runId },
        });
      });
    }
    for (const run of this.store.all('runs', runSchema)) {
      if (
        run.status !== 'queued' ||
        this.working.has(run.threadId) ||
        this.workingAgents.has(run.agentId)
      ) {
        continue;
      }
      this.working.add(run.threadId);
      this.workingAgents.add(run.agentId);
      void this.execute(run.id)
        .finally(() => {
          this.working.delete(run.threadId);
          this.workingAgents.delete(run.agentId);
        })
        .catch((error) => {
          process.stderr.write(
            `OpenFactory worker failed: ${error instanceof Error ? error.message : String(error)}\n`,
          );
        });
    }
  }
  private async execute(runId: string) {
    let run = this.store.get('runs', runId, runSchema);
    if (!run) {
      return;
    }
    let session = this.getSession(run.threadId);
    let interrupted = false;
    try {
      run = { ...run, status: 'running', startedAt: now() };
      this.store.put('runs', run.id, run);
      const agent = this.getAgent(run.agentId);
      this.store.put('agents', agent.id, {
        ...agent,
        lastRunAt: run.startedAt,
        lastRunStatus: 'running',
        lastRunError: null,
      });
      if (session.workspaceStrategy.type === 'worktree' && !session.workspacePrepared) {
        const cwd = join(this.directory, 'worktrees', session.thread.id);
        mkdirSync(join(this.directory, 'worktrees'), { recursive: true, mode: 0o700 });
        let baseRef = session.workspaceStrategy.baseRef;
        if (session.workspaceStrategy.startFromOrigin) {
          const branch =
            baseRef === 'HEAD'
              ? execFileSync('git', ['branch', '--show-current'], {
                  cwd: session.cwd,
                  encoding: 'utf8',
                }).trim()
              : baseRef;
          if (!branch) {
            throw new Error(
              'Choose an explicit baseRef to start from origin in a detached checkout.',
            );
          }
          baseRef = `origin/${branch}`;
        }
        const branchArgs = session.workspaceStrategy.branch
          ? ['-b', session.workspaceStrategy.branch]
          : ['--detach'];
        const registered = execFileSync('git', ['worktree', 'list', '--porcelain'], {
          cwd: session.cwd,
          encoding: 'utf8',
        });
        if (!registered.split('\n').includes(`worktree ${cwd}`)) {
          execFileSync('git', ['worktree', 'add', ...branchArgs, '--', cwd, baseRef], {
            cwd: session.cwd,
            stdio: 'pipe',
          });
        }
        session = { ...session, cwd, workspacePrepared: true };
        this.store.put('sessions', session.thread.id, session);
      }
      const message = this.store.get('messages', run.userMessageId, messageSchema);
      if (!message) {
        throw new Error('The saved prompt is missing.');
      }
      const worker = launchProvider(
        session,
        message.text,
        (event) => {
          if (event.type === 'session') {
            if (session.nativeSessionId && session.nativeSessionId !== event.id) {
              throw new Error('Provider resumed a different native session.');
            }
            session = { ...session, nativeSessionId: event.id };
            this.store.put('sessions', session.thread.id, session);
          }
          if (event.type === 'message' && event.text) {
            const id = `${runId}:${event.id}`;
            this.store.put(
              'messages',
              id,
              messageSchema.parse({
                id,
                runId,
                role: 'assistant',
                text: event.text,
                createdAt: now(),
              }),
            );
          }
          if (event.type === 'usage') {
            const current = this.store.get('runs', runId, runSchema);
            if (current) {
              const previous =
                session.modelSelection.instanceId === 'codex' ? session.codexUsageTotals : null;
              const delta = previous
                ? {
                    input: event.usage.input - previous.input,
                    cached: event.usage.cached - previous.cached,
                    cacheWrite: event.usage.cacheWrite - previous.cacheWrite,
                    output: event.usage.output - previous.output,
                    costUsd: null,
                  }
                : event.usage;
              const usage = [delta.input, delta.cached, delta.cacheWrite, delta.output].some(
                (value) => value < 0,
              )
                ? null
                : delta;
              if (session.modelSelection.instanceId === 'codex') {
                session = { ...session, codexUsageTotals: event.usage };
              }
              this.store.transaction(() => {
                this.store.put('runs', runId, { ...current, usage });
                this.store.put('sessions', session.thread.id, session);
              });
            }
          }
        },
        (line) =>
          appendFileSync(join(this.directory, 'events', `${runId}.jsonl`), `${line}\n`, {
            mode: 0o600,
          }),
      );
      this.active.set(session.thread.id, {
        runId,
        stop: () => {
          interrupted = true;
          worker.stop();
        },
      });
      await worker.done;
      if (!session.nativeSessionId) {
        throw new Error('Provider completed without a resumable session ID.');
      }
      const current = this.store.get('runs', runId, runSchema);
      this.store.put('runs', runId, {
        ...current,
        status: interrupted ? 'interrupted' : 'completed',
        completedAt: now(),
      });
      this.store.put('agents', agent.id, {
        ...this.getAgent(agent.id),
        lastRunStatus: interrupted ? 'failed' : 'succeeded',
        lastRunError: interrupted ? 'Stopped from OpenFactory.' : null,
      });
    } catch (error) {
      const detail = interrupted
        ? 'Stopped from OpenFactory.'
        : error instanceof Error
          ? error.message
          : 'Provider execution failed.';
      const current = this.store.get('runs', runId, runSchema);
      const completedAt = now();
      this.store.put('runs', runId, {
        ...current,
        status: interrupted ? 'interrupted' : 'failed',
        completedAt,
        error: detail,
        capacityRetry:
          !interrupted && capacityFailure(detail)
            ? {
                status: 'pending',
                at: new Date(new Date(completedAt).getTime() + capacityDelayMs).toISOString(),
              }
            : null,
      });
      this.store.put('agents', run.agentId, {
        ...this.getAgent(run.agentId),
        lastRunStatus: 'failed',
        lastRunError: detail,
      });
    } finally {
      this.active.delete(session.thread.id);
    }
  }
  private projection(threadId: string) {
    const archive = this.store.get('archives', threadId, z.unknown());
    if (archive) {
      return archive;
    }
    const session = this.getSession(threadId);
    return {
      thread: {
        ...session.thread,
        nativeSessionId: session.nativeSessionId,
        provider: session.modelSelection.instanceId,
        cwd: session.cwd,
      },
      runs: this.store.all('runs', runSchema).filter((run) => run.threadId === threadId),
      messages: this.store
        .all('messages', messageSchema)
        .filter(
          (message) =>
            message.runId &&
            this.store.get('runs', message.runId, runSchema)?.threadId === threadId,
        ),
      providerThreads: [],
      providerTurns: [],
      attempts: [],
    };
  }
  async rpc(method: string, input: unknown): Promise<unknown> {
    switch (method) {
      case 'runtime.status':
        return {
          owner: 'openfactory',
          directory: this.directory,
          agents: this.store.all('agents', ownedAgentSchema).length,
          active: this.active.size,
        };
      case 'teams.list': {
        const { projectId } = z.object({ projectId: z.string() }).parse(input);
        return { teams: this.projectTeams(projectId) };
      }
      case 'teams.replace': {
        const data = z
          .object({ projectId: z.string(), teams: z.array(teamSetupSchema).max(100) })
          .parse(input);
        if (!this.store.get('projects', data.projectId, projectSchema)) {
          throw new Error('This factory no longer exists.');
        }
        const agents = this.store
          .all('agents', ownedAgentSchema)
          .filter((agent) => agent.projectId === data.projectId);
        const paths = new Set<string>();
        for (const setup of data.teams) {
          if (paths.has(setup.path)) {
            throw new Error(`Duplicate team path: ${setup.path}`);
          }
          paths.add(setup.path);
          resolveTeam(setup, agents);
        }
        this.store.transaction(() => {
          for (const team of this.store.all('teams', storedTeamSchema)) {
            if (team.projectId === data.projectId) {
              this.store.delete('teams', teamKey(team.projectId, team.path));
            }
          }
          for (const team of data.teams) {
            this.store.put('teams', teamKey(data.projectId, team.path), {
              ...team,
              projectId: data.projectId,
            });
          }
        });
        return { teams: this.projectTeams(data.projectId) };
      }
      case 'teams.run': {
        const data = z
          .object({
            projectId: z.string(),
            path: z.string(),
            member: z.string().optional(),
            text: z.string().trim().min(1).max(16000).optional(),
            requestId: z.string().min(1),
          })
          .parse(input);
        const team = this.projectTeams(data.projectId).find((item) => item.path === data.path);
        if (!team) {
          throw new Error('This team no longer exists.');
        }
        const member = team.agents.find(
          (item) => item.id === (data.member ?? team.definition.lead),
        );
        if (!member) {
          throw new Error('Choose a member of this team.');
        }
        const agent = this.getAgent(member.agent.id);
        const text = data.text ? `${agent.prompt}\n\nAssignment:\n${data.text}` : agent.prompt;
        const receipt = this.store.transaction(() =>
          this.enqueue(agent, text, `team:${data.requestId}`, 'web'),
        );
        this.tick();
        return { task: this.publicAgent(this.getAgent(agent.id)), ...receipt };
      }
      case 'agents.list':
        return {
          tasks: this.store.all('agents', ownedAgentSchema).map((agent) => this.publicAgent(agent)),
        };
      case 'workspace.snapshot': {
        const sessions = this.store.all('sessions', sessionSchema).map((session) => session.thread);
        const archives = this.store.all(
          'archives',
          threadHistorySchema.extend({
            thread: threadHistorySchema.shape.thread.extend({
              projectId: z.string(),
              createdAt: z.string(),
            }),
          }),
        );
        return {
          snapshot: {
            projects: this.store.all('projects', projectSchema),
            threads: [
              ...sessions,
              ...archives.map((p) => ({
                ...p.thread,
                agentIds: [
                  ...new Set(
                    p.messages.flatMap((m) => (m.scheduledTaskId ? [m.scheduledTaskId] : [])),
                  ),
                ],
              })),
            ],
          },
        };
      }
      case 'projects.delete': {
        const { id } = idInput.parse(input);
        const agents = this.store
          .all('agents', ownedAgentSchema)
          .filter((agent) => agent.projectId === id);
        const agentIds = new Set(agents.map((agent) => agent.id));
        if (
          agents.some((agent) => this.workingAgents.has(agent.id)) ||
          this.store
            .all('runs', runSchema)
            .some((run) => agentIds.has(run.agentId) && run.status === 'running')
        ) {
          throw new Error('Stop active runs before deleting this factory.');
        }
        this.store.deleteProject(id);
        return { deleted: true };
      }
      case 'projects.upsert': {
        const project = projectSchema.parse(input);
        if (!isAbsolute(project.workspaceRoot)) {
          throw new Error('Use an absolute working directory.');
        }
        this.store.put('projects', project.id, project);
        return project;
      }
      case 'agents.upsert': {
        const data = upsertSchema.parse(input);
        if (!this.store.get('projects', data.projectId, projectSchema)) {
          throw new Error('This factory no longer exists.');
        }
        const existing = data.id ? this.getAgent(data.id) : null;
        if (existing && data.expectedSource && agentDefinition(existing) !== data.expectedSource) {
          throw new Error('This definition changed since you opened it. Reload the definition.');
        }
        if (
          existing &&
          existing.projectId !== data.projectId &&
          this.projectTeams(existing.projectId).some((team) =>
            team.agents.some((member) => member.agent.id === existing.id),
          )
        ) {
          throw new Error('Remove this agent from its teams before moving it to another factory.');
        }
        const id = existing?.id ?? randomUUID();
        const changedSchedule =
          JSON.stringify(existing?.schedule) !== JSON.stringify(data.schedule);
        const agent = ownedAgentSchema.parse({
          ...existing,
          ...data,
          id,
          threadId: existing?.threadId ?? null,
          nextRunAt: data.enabled
            ? !changedSchedule && existing?.enabled
              ? existing.nextRunAt
              : nextScheduledAt(data.schedule, new Date())
            : null,
          lastRunAt: existing?.lastRunAt ?? null,
          lastRunStatus: existing?.lastRunStatus ?? 'never',
          lastRunError: existing?.lastRunError ?? null,
          runCount: existing?.runCount ?? 0,
        });
        this.store.transaction(() => {
          this.store.put('agents', id, agent);
          if (!this.store.get('secrets', id, secretSchema)) {
            this.store.put('secrets', id, {
              token: randomBytes(32).toString('hex'),
              signatureSecret: null,
            });
          }
        });
        return { task: this.publicAgent(agent) };
      }
      case 'agents.setEnabled': {
        const data = idInput
          .extend({ enabled: z.boolean(), nextRunAt: z.iso.datetime().nullable().optional() })
          .parse(input);
        const agent = this.getAgent(data.id);
        const updated = {
          ...agent,
          enabled: data.enabled,
          nextRunAt: data.enabled
            ? (data.nextRunAt ?? nextScheduledAt(agent.schedule, new Date()))
            : null,
        };
        this.store.put('agents', agent.id, updated);
        return { task: this.publicAgent(updated) };
      }
      case 'agents.run': {
        const data = idInput.extend({ requestId: z.string().min(1) }).parse(input);
        const agent = this.getAgent(data.id);
        const receipt = this.store.transaction(() =>
          this.enqueue(agent, agent.prompt, `manual:${data.requestId}`, 'web'),
        );
        this.tick();
        return { task: this.publicAgent(this.getAgent(agent.id)), ...receipt };
      }
      case 'agents.deliveries': {
        const { id } = idInput.parse(input);
        this.getAgent(id);
        const schema = deliverySchema.extend({ agentId: z.string() });
        return {
          deliveries: this.store
            .all('deliveries', schema)
            .filter((d) => d.agentId === id)
            .slice(-50)
            .reverse(),
        };
      }
      case 'agents.webhookSecret': {
        const data = idInput.extend({ secret: z.string().min(16) }).parse(input);
        this.getAgent(data.id);
        const secret = this.store.get('secrets', data.id, secretSchema);
        if (!secret) {
          throw new Error('Webhook credentials are unavailable.');
        }
        this.store.put('secrets', data.id, { ...secret, signatureSecret: data.secret });
        return { configured: true };
      }
      case 'sessions.read': {
        const { threadId } = z.object({ threadId: z.string() }).parse(input);
        return { projection: this.projection(threadId) };
      }
      case 'sessions.projection': {
        const { threadId } = z.object({ threadId: z.string() }).parse(input);
        return this.projection(threadId);
      }
      case 'sessions.send': {
        const data = sendSchema.parse(input);
        const session = this.getSession(data.threadId);
        if (data.agentId && data.agentId !== session.thread.agentId) {
          throw new Error('This conversation belongs to another agent.');
        }
        const receipt = this.store.transaction(() =>
          this.enqueue(
            this.getAgent(session.thread.agentId),
            data.text,
            `message:${data.messageId}`,
            'web',
            data.threadId,
          ),
        );
        this.tick();
        return { accepted: true, ...receipt };
      }
      case 'sessions.stop': {
        const data = z
          .object({ threadId: z.string(), agentId: z.string().optional() })
          .parse(input);
        const session = this.getSession(data.threadId);
        if (data.agentId && session.thread.agentId !== data.agentId) {
          throw new Error('This conversation belongs to another agent.');
        }
        const active = this.active.get(data.threadId);
        active?.stop();
        for (const run of this.store.all('runs', runSchema)) {
          if (
            run.threadId === data.threadId &&
            (run.capacityRetry?.status === 'pending' ||
              (!run.capacityRetry && run.status === 'failed' && capacityFailure(run.error)))
          ) {
            this.store.put('runs', run.id, { ...run, capacityRetry: { status: 'cancelled' } });
          }
          if (run.threadId === data.threadId && run.status === 'queued') {
            this.store.put('runs', run.id, {
              ...run,
              status: 'interrupted',
              completedAt: now(),
              error: 'Queue stopped from OpenFactory.',
            });
          }
        }
        return { stopped: Boolean(active) };
      }
      case 'migration.import':
        return this.import(input);
      case 'webhooks.receive':
        return this.webhook(input);
      default:
        throw new Error(`Unsupported OpenFactory runtime method: ${method}`);
    }
  }
  private import(input: unknown) {
    const data = importSchema.parse(input);
    this.store.transaction(() => {
      for (const project of data.projects) {
        if (!this.store.get('projects', project.id, projectSchema)) {
          this.store.put('projects', project.id, project);
        }
      }
      for (const agent of data.agents) {
        if (this.store.get('agents', agent.id, ownedAgentSchema)) {
          continue;
        }
        this.store.put('agents', agent.id, {
          ...agent,
          enabled: false,
          nextRunAt: null,
          threadId: null,
          lastRunStatus: 'never',
          lastRunError: null,
        });
        this.store.put('secrets', agent.id, {
          token: randomBytes(32).toString('hex'),
          signatureSecret: null,
        });
      }
      for (const projection of data.histories) {
        const previous = this.store.get('archives', projection.thread.id, threadHistorySchema);
        const runs = [
          ...new Map(
            [...(previous?.runs ?? []), ...projection.runs].map((run) => [run.id, run]),
          ).values(),
        ].sort((a, b) => a.ordinal - b.ordinal);
        const messages = [
          ...new Map(
            [...(previous?.messages ?? []), ...projection.messages].map((message) => [
              message.id,
              message,
            ]),
          ).values(),
        ];
        this.store.put('archives', projection.thread.id, {
          ...projection,
          runs,
          messages,
          thread: { ...projection.thread, createdAt: projection.runs[0]?.requestedAt ?? now() },
        });
      }
    });
    return { imported: data.agents.length, paused: true };
  }
  private webhook(input: unknown) {
    const data = z
      .object({
        id: z.string(),
        token: z.string(),
        body: z.string().max(1_400_000),
        headers: z.record(z.string(), z.string()),
        requestId: z.string().max(200).optional(),
      })
      .parse(input);
    const agent = this.getAgent(data.id);
    const credentials = this.store.get('secrets', agent.id, secretSchema);
    if (
      !credentials ||
      !safeEqual(data.token, credentials.token) ||
      agent.schedule.type !== 'webhook'
    ) {
      return { status: 404, error: 'Webhook not found.' };
    }
    const raw = Buffer.from(data.body, 'base64');
    if (raw.length > 1_048_576) {
      return { status: 413, error: 'Keep webhook bodies under 1 MB.' };
    }
    const deliveryId = randomUUID();
    const delivery = {
      id: deliveryId,
      agentId: agent.id,
      receivedAt: now(),
      method: 'POST',
      bodyBytes: raw.length,
    };
    const reject = (status: number, error: string) => {
      this.store.put('deliveries', deliveryId, { ...delivery, outcome: 'rejected', error });
      return { status, error };
    };
    if (!agent.enabled) {
      return reject(409, 'This agent is paused.');
    }
    const signature = agent.schedule.signature;
    if (signature) {
      if (!credentials.signatureSecret) {
        return reject(503, 'Configure the webhook signing secret before accepting deliveries.');
      }
      const expected =
        signature.prefix +
        createHmac('sha256', credentials.signatureSecret).update(raw).digest(signature.encoding);
      if (!safeEqual(data.headers[signature.header.toLowerCase()] ?? '', expected)) {
        return reject(401, 'Invalid webhook signature.');
      }
    }
    try {
      const body: unknown = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      const context: Record<string, unknown> = { body, headers: data.headers, method: 'POST' };
      const text = agent.prompt.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, path: string) => {
        let value: unknown = context;
        for (const part of path.split('.')) {
          value = z.record(z.string(), z.unknown()).parse(value)[part];
        }
        if (value === undefined) {
          throw new Error(`Missing webhook value: ${path}`);
        }
        return typeof value === 'string' ? value : JSON.stringify(value);
      });
      const receipt = this.store.transaction(() => {
        const result = this.enqueue(
          agent,
          text,
          `webhook:${agent.id}:${data.requestId ?? deliveryId}`,
          'webhook',
        );
        this.store.put('deliveries', deliveryId, { ...delivery, outcome: 'accepted', error: null });
        return result;
      });
      this.tick();
      return { status: 202, runId: receipt.runId, threadId: receipt.threadId };
    } catch (error) {
      return reject(400, error instanceof Error ? error.message : 'Invalid webhook body.');
    }
  }
}
