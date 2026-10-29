import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { projectAgentConversations } from '@openfactory/core';
import { AgentRuntime } from './runtime';
import { messageSchema, ownedAgentSchema, runSchema, sessionSchema } from './contracts';
import { nextScheduledAt } from './schedule';
import { parseProviderEvent, providerCommand } from './providers';

let directory: string;
let runtime: AgentRuntime;
const savedSchema = z.object({ task: ownedAgentSchema });
const receiptSchema = z.object({ runId: z.string(), threadId: z.string() });
async function create(overrides: Record<string, unknown> = {}) {
  return savedSchema.parse(
    await runtime.rpc('agents.upsert', {
      title: 'Test agent',
      prompt: 'Hello',
      projectId: 'project',
      schedule: { type: 'manual' },
      enabled: false,
      modelSelection: {
        instanceId: 'codex',
        model: 'test',
        options: [{ id: 'reasoningEffort', value: 'medium' }],
      },
      runtimeMode: 'approval-required',
      interactionMode: 'default',
      workspaceStrategy: { type: 'root' },
      ...overrides,
    }),
  ).task;
}
async function finished(runId: string) {
  for (let n = 0; n < 150; n++) {
    const run = runtime.store.get('runs', runId, runSchema);
    if (run && !['queued', 'running'].includes(run.status)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('The fixture provider did not finish.');
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'openfactory-runtime-'));
  const binary = join(directory, 'provider');
  await writeFile(
    binary,
    `#!/usr/bin/env node
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
const claude = process.argv.includes('-p');
const emit = (data) => process.stdout.write(JSON.stringify(data) + '\\n');
if (claude) {
  emit({type:'system', subtype:'init', session_id:'claude-session'});
  emit({type:'assistant', message:{id:'answer', content:[{type:'text',text:prompt}]}});
  emit({type:'result', session_id:'claude-session', is_error:false, usage:{input_tokens:8,output_tokens:2}});
} else {
  emit({type:'thread.started',thread_id:process.argv.includes('resume') ? process.argv.at(-2) : 'codex-session'});
  if(prompt==='HOLD') await new Promise(resolve => setTimeout(resolve,10000));
  if(prompt==='CAPACITY') {emit({type:'turn.failed',error:{message:'Selected model is at capacity. Please try a different model.'}});process.exit(1);}
  if(prompt==='FAIL') {emit({type:'turn.failed',error:{message:'fixture failed'}});process.exit(1);}
  emit({type:'item.completed',item:{id:'answer',type:'agent_message',text:prompt + (process.argv.includes('resume')?' resumed':'')}});
  emit({type:'turn.completed',usage:process.argv.includes('resume')?{input_tokens:20,cached_input_tokens:6,output_tokens:4}:{input_tokens:10,cached_input_tokens:3,output_tokens:2}});
}
`,
  );
  await chmod(binary, 0o700);
  vi.stubEnv('OPENFACTORY_CODEX_BIN', binary);
  vi.stubEnv('OPENFACTORY_CLAUDE_BIN', binary);
  runtime = new AgentRuntime(directory);
  await runtime.rpc('projects.upsert', {
    id: 'project',
    title: 'Factory',
    workspaceRoot: directory,
  });
});
afterEach(async () => {
  await runtime.close();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('owned runtime', () => {
  it('starts a paused manual agent directly, persists output and usage, and resumes a native session', async () => {
    const agent = await create();
    const receipt = receiptSchema.parse(
      await runtime.rpc('agents.run', { id: agent.id, requestId: 'run-once' }),
    );
    expect((await finished(receipt.runId)).status).toBe('completed');
    expect((await finished(receipt.runId)).usage).toMatchObject({ input: 7, cached: 3, output: 2 });
    const session = runtime.store.get('sessions', receipt.threadId, sessionSchema);
    expect(session?.nativeSessionId).toBe('codex-session');
    expect(session?.modelSelection.options).toEqual({ reasoningEffort: 'medium' });
    await runtime.close();
    runtime = new AgentRuntime(directory);
    const reply = receiptSchema.parse(
      await runtime.rpc('sessions.send', {
        threadId: receipt.threadId,
        text: 'Follow up',
        messageId: 'follow-up',
      }),
    );
    expect(await finished(reply.runId)).toMatchObject({
      status: 'completed',
      usage: { input: 7, cached: 3, output: 2 },
    });
    const projection = z
      .object({ messages: z.array(z.object({ text: z.string() })) })
      .parse(await runtime.rpc('sessions.projection', { threadId: receipt.threadId }));
    expect(projection.messages.map((message) => message.text)).toEqual([
      'Hello',
      'Hello',
      'Follow up',
      'Follow up resumed',
    ]);
    await runtime.close();
    runtime = new AgentRuntime(directory);
    expect(runtime.getAgent(agent.id).runCount).toBe(2);
    expect(
      runtime.store.get('sessions', receipt.threadId, sessionSchema)?.nativeSessionId,
    ).toBeTruthy();
  });

  it('deduplicates manual requests and rejects changed content for a follow-up key', async () => {
    const agent = await create();
    const first = receiptSchema.parse(
      await runtime.rpc('agents.run', { id: agent.id, requestId: 'same' }),
    );
    expect(
      receiptSchema.parse(await runtime.rpc('agents.run', { id: agent.id, requestId: 'same' })),
    ).toEqual(first);
    await finished(first.runId);
    const send = { threadId: first.threadId, text: 'First', messageId: 'same-message' };
    await runtime.rpc('sessions.send', send);
    await expect(runtime.rpc('sessions.send', { ...send, text: 'Changed' })).rejects.toThrow(
      'different content',
    );
  });

  it('claims a due interval once and stores its next due time across a restart', async () => {
    const agent = await create({ schedule: { type: 'interval', everyMs: 60000 }, enabled: true });
    const at = new Date(agent.nextRunAt!);
    runtime.tick(at);
    runtime.tick(at);
    const runs = runtime.store.all('runs', runSchema);
    expect(runs).toHaveLength(1);
    await finished(runs[0]!.id);
    await runtime.close();
    runtime = new AgentRuntime(directory);
    runtime.tick(at);
    expect(runtime.store.all('runs', runSchema)).toHaveLength(1);
    expect(runtime.getAgent(agent.id).nextRunAt).toBe(new Date(at.getTime() + 60000).toISOString());
  });

  it('pauses a broken scheduled checkout without blocking another due agent', async () => {
    const broken = await create({
      title: 'Broken',
      enabled: true,
      schedule: { type: 'interval', everyMs: 60000 },
      workspaceStrategy: { type: 'root', branch: 'missing-branch' },
    });
    const healthy = await create({
      title: 'Healthy',
      enabled: true,
      schedule: { type: 'interval', everyMs: 60000 },
    });
    expect(() => runtime.tick(new Date(Date.now() + 61000))).not.toThrow();
    expect(runtime.getAgent(broken.id)).toMatchObject({ enabled: false, lastRunStatus: 'failed' });
    const run = runtime.store.all('runs', runSchema).find((item) => item.agentId === healthy.id);
    if (!run) {
      throw new Error('Healthy agent did not dispatch.');
    }
    expect((await finished(run.id)).status).toBe('completed');
  });

  it('executes verified webhook payloads through the same durable queue and rejects bad signatures', async () => {
    const agent = await create({
      prompt: 'Event {{body.event}}',
      schedule: {
        type: 'webhook',
        signature: { header: 'x-signature', encoding: 'hex', prefix: 'sha256=' },
      },
      enabled: true,
    });
    await runtime.rpc('agents.webhookSecret', { id: agent.id, secret: 'fixture-signing-secret' });
    const listed = z
      .object({
        tasks: z.array(z.object({ id: z.string(), webhook: z.object({ url: z.string() }) })),
      })
      .parse(await runtime.rpc('agents.list', {}));
    const token = listed.tasks[0]!.webhook.url.split('/').at(-1)!;
    const body = JSON.stringify({ event: 'push' });
    const request = {
      id: agent.id,
      token,
      body: Buffer.from(body).toString('base64'),
      headers: { 'x-signature': 'bad' },
      requestId: 'delivery',
    };
    expect(await runtime.rpc('webhooks.receive', request)).toMatchObject({ status: 401 });
    request.headers['x-signature'] =
      'sha256=' + createHmac('sha256', 'fixture-signing-secret').update(body).digest('hex');
    const response = await runtime.rpc('webhooks.receive', request);
    expect(response).toMatchObject({ status: 202 });
    const receipt = receiptSchema.parse(response);
    await finished(receipt.runId);
    expect(receiptSchema.parse(await runtime.rpc('webhooks.receive', request))).toEqual(receipt);
    expect(runtime.store.all('runs', runSchema)).toHaveLength(1);
    await runtime.rpc('agents.setEnabled', { id: agent.id, enabled: false });
    expect(await runtime.rpc('webhooks.receive', { ...request, requestId: 'later' })).toMatchObject(
      { status: 409 },
    );
  });

  it('imports T3-shaped options and history without re-enabling an existing agent on retry', async () => {
    const agent = await create({ enabled: true, schedule: { type: 'interval', everyMs: 60000 } });
    const imported = {
      ...agent,
      id: 'imported',
      modelSelection: {
        instanceId: 'codex',
        model: 'test',
        options: [{ id: 'reasoningEffort', value: 'medium' }],
      },
    };
    const snapshot = {
      projects: [{ id: 'project', title: 'Factory', workspaceRoot: directory }],
      agents: [imported],
      histories: [
        {
          thread: { id: 'old-thread', title: 'Old coordinator', projectId: 'project' },
          runs: [],
          messages: [
            {
              id: 'old-message',
              runId: null,
              role: 'assistant',
              text: 'Retained history',
              createdAt: new Date().toISOString(),
              scheduledTaskId: imported.id,
            },
          ],
        },
      ],
    };
    await runtime.rpc('migration.import', snapshot);
    expect(runtime.getAgent('imported')).toMatchObject({
      enabled: false,
      modelSelection: { options: { reasoningEffort: 'medium' } },
    });
    await runtime.rpc('agents.setEnabled', {
      id: 'imported',
      enabled: true,
      nextRunAt: imported.nextRunAt,
    });
    expect(runtime.getAgent('imported').nextRunAt).toBe(imported.nextRunAt);
    await runtime.rpc('migration.import', snapshot);
    expect(runtime.getAgent('imported').enabled).toBe(true);
    expect(await runtime.rpc('sessions.projection', { threadId: 'old-thread' })).toMatchObject({
      messages: [{ text: 'Retained history' }],
    });
  });

  it('keeps an isolated worktree for follow-ups after the provider fails before session initialization', async () => {
    execFileSync('git', ['init', directory], { stdio: 'pipe' });
    execFileSync(
      'git',
      [
        '-C',
        directory,
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '--allow-empty',
        '-m',
        'Initial',
      ],
      { stdio: 'pipe' },
    );
    const agent = await create({ workspaceStrategy: { type: 'worktree', baseRef: 'HEAD' } });
    vi.stubEnv('OPENFACTORY_CODEX_BIN', join(directory, 'missing-cli'));
    const first = receiptSchema.parse(
      await runtime.rpc('agents.run', { id: agent.id, requestId: 'worktree' }),
    );
    expect((await finished(first.runId)).status).toBe('failed');
    const session = runtime.store.get('sessions', first.threadId, sessionSchema);
    expect(session?.cwd).toBe(join(directory, 'worktrees', first.threadId));
    vi.stubEnv('OPENFACTORY_CODEX_BIN', join(directory, 'provider'));
    const followup = receiptSchema.parse(
      await runtime.rpc('sessions.send', {
        threadId: first.threadId,
        text: 'Try again',
        messageId: 'retry-provider',
      }),
    );
    expect((await finished(followup.runId)).status).toBe('completed');
    expect(runtime.store.get('sessions', first.threadId, sessionSchema)?.cwd).toBe(session?.cwd);
  });

  it('records actual provider failures rather than successful dispatch', async () => {
    const agent = await create({ prompt: 'FAIL' });
    const receipt = receiptSchema.parse(
      await runtime.rpc('agents.run', { id: agent.id, requestId: 'failure' }),
    );
    expect(await finished(receipt.runId)).toMatchObject({
      status: 'failed',
      error: 'fixture failed',
    });
    expect(runtime.getAgent(agent.id).lastRunStatus).toBe('failed');
    runtime.tick(new Date(Date.now() + 300001));
    expect(runtime.store.all('runs', runSchema)).toHaveLength(1);
  });

  it('continues capacity failures once after five minutes, across a restart', async () => {
    const agent = await create({ prompt: 'CAPACITY', enabled: true });
    const first = receiptSchema.parse(
      await runtime.rpc('agents.run', { id: agent.id, requestId: 'capacity' }),
    );
    const failed = await finished(first.runId);
    expect(failed).toMatchObject({
      status: 'failed',
      error: 'Selected model is at capacity. Please try a different model.',
      capacityRetry: { status: 'pending' },
    });
    const due = new Date(new Date(failed.completedAt!).getTime() + 300000);
    runtime.tick(new Date(due.getTime() - 1));
    expect(runtime.store.all('runs', runSchema)).toHaveLength(1);
    await runtime.close();
    runtime = new AgentRuntime(directory);
    runtime.tick(due);
    runtime.tick(due);
    const runs = runtime.store.all('runs', runSchema);
    expect(runs).toHaveLength(2);
    const retry = runs[1]!;
    expect(retry.threadId).toBe(first.threadId);
    expect(runtime.store.get('messages', retry.userMessageId, messageSchema)).toMatchObject({
      text: 'continue',
      creationSource: 'retry',
      createdBy: 'automation',
    });
    expect(await finished(retry.id)).toMatchObject({ status: 'completed' });
    expect(runtime.store.all('messages', messageSchema).at(-1)?.text).toBe('continue resumed');
    const conversations = projectAgentConversations(
      await runtime.rpc('sessions.projection', { threadId: first.threadId }),
      agent.id,
    );
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({ id: first.runId, status: 'completed', error: null });
    expect(conversations[0]?.messages.map((message) => message.text)).toEqual([
      'CAPACITY',
      'continue',
      'continue resumed',
    ]);
    expect(runtime.store.get('runs', first.runId, runSchema)).toMatchObject({
      capacityRetry: { status: 'continued', runId: retry.id },
    });
    await runtime.close();
    runtime = new AgentRuntime(directory);
    runtime.tick(due);
    expect(runtime.store.all('runs', runSchema)).toHaveLength(2);
  });

  it.each(['disabled', 'newer turn', 'stopped'])(
    'cancels a pending capacity continuation when %s',
    async (reason) => {
      const agent = await create({ prompt: 'CAPACITY', enabled: true });
      const first = receiptSchema.parse(
        await runtime.rpc('agents.run', { id: agent.id, requestId: 'capacity' }),
      );
      const failed = await finished(first.runId);
      if (reason === 'disabled') {
        await runtime.rpc('agents.setEnabled', { id: agent.id, enabled: false });
      } else if (reason === 'stopped') {
        await runtime.rpc('sessions.stop', { threadId: first.threadId });
      } else {
        const reply = receiptSchema.parse(
          await runtime.rpc('sessions.send', {
            threadId: first.threadId,
            text: 'Manual recovery',
            messageId: 'manual-recovery',
          }),
        );
        await finished(reply.runId);
      }
      const count = runtime.store.all('runs', runSchema).length;
      runtime.tick(new Date(new Date(failed.completedAt!).getTime() + 300000));
      expect(runtime.store.all('runs', runSchema)).toHaveLength(count);
      expect(runtime.store.get('runs', first.runId, runSchema)).toMatchObject({
        capacityRetry: { status: 'cancelled' },
      });
    },
  );

  it('runs Claude directly and records its native session and output', async () => {
    const agent = await create({ modelSelection: { instanceId: 'claude-code', model: 'fixture' } });
    const receipt = receiptSchema.parse(
      await runtime.rpc('agents.run', { id: agent.id, requestId: 'claude' }),
    );
    expect((await finished(receipt.runId)).status).toBe('completed');
    expect(runtime.store.get('sessions', receipt.threadId, sessionSchema)?.nativeSessionId).toBe(
      'claude-session',
    );
  });

  it('checks session ownership and cancels a running provider and its queued follow-up', async () => {
    const agent = await create({ prompt: 'HOLD' });
    const other = await create({ title: 'Other' });
    const receipt = receiptSchema.parse(
      await runtime.rpc('agents.run', { id: agent.id, requestId: 'hold' }),
    );
    await expect(
      runtime.rpc('sessions.send', {
        threadId: receipt.threadId,
        agentId: other.id,
        text: 'Intrude',
        messageId: 'bad',
      }),
    ).rejects.toThrow('another agent');
    const queued = receiptSchema.parse(
      await runtime.rpc('sessions.send', {
        threadId: receipt.threadId,
        text: 'Queued',
        messageId: 'queued',
      }),
    );
    await runtime.rpc('sessions.stop', { threadId: receipt.threadId, agentId: agent.id });
    expect((await finished(receipt.runId)).status).toBe('interrupted');
    expect((await finished(queued.runId)).status).toBe('interrupted');
  });
});

describe('schedules and provider protocol', () => {
  it('honors weekdays and manual schedules', () => {
    const monday = new Date(2026, 9, 26, 10, 0);
    expect(nextScheduledAt({ type: 'manual' }, monday)).toBeNull();
    expect(nextScheduledAt({ type: 'fixed_time', timeOfDay: '09:00', weekdays: [1] }, monday)).toBe(
      new Date(2026, 10, 2, 9, 0).toISOString(),
    );
  });
  it('builds shell-free resume commands with the saved permissions and model options', () => {
    const session = sessionSchema.parse({
      thread: {
        id: 'session',
        title: 'Test',
        projectId: 'project',
        createdAt: new Date().toISOString(),
        runtime: 'openfactory',
        agentId: 'agent',
      },
      nativeSessionId: 'native-id',
      cwd: directory,
      modelSelection: {
        instanceId: 'codex',
        model: 'model',
        options: { reasoningEffort: 'medium' },
      },
      runtimeMode: 'full-access',
      interactionMode: 'default',
      workspaceStrategy: { type: 'root' },
    });
    expect(providerCommand(session).args).toEqual([
      'exec',
      'resume',
      '--json',
      '--skip-git-repo-check',
      '--model',
      'model',
      '--config',
      'approval_policy="never"',
      '--config',
      'sandbox_mode="danger-full-access"',
      '--config',
      'model_reasoning_effort="medium"',
      'native-id',
      '-',
    ]);
  });
  it('recognizes a Claude result failure even with successful process exit', () => {
    expect(
      parseProviderEvent(
        'claude-code',
        JSON.stringify({
          type: 'result',
          session_id: 'native',
          is_error: true,
          errors: ['Authentication failed'],
        }),
      ),
    ).toContainEqual({ type: 'error', message: 'Authentication failed' });
  });
});

describe('live teams', () => {
  async function setupTeam() {
    const operator = await create({ title: 'Operator', prompt: 'Investigate carefully.' });
    const digest = await create({ title: 'Digest', prompt: 'Summarize actual evidence.' });
    const setup = {
      path: 'teams/reliability/team.yaml',
      source:
        'schemaVersion: v1alpha1\nname: Reliability\ndescription: Keep the project healthy.\ninstructions: ./instructions.md\nlead: operator\nmembers:\n  operator:\n    agent: agents/operator/agent.md\n  digest:\n    agent: agents/digest/agent.md\n    reportsTo: operator\n',
      instructions: 'Keep one writer. Preserve approval holds.',
      bindings: { 'agents/operator/agent.md': operator.id, 'agents/digest/agent.md': digest.id },
    };
    await runtime.rpc('teams.replace', { projectId: 'project', teams: [setup] });
    return { operator, digest, setup };
  }
  it('lists actual agents, adds shared instructions to runs, and retains teams across restarts', async () => {
    const { digest } = await setupTeam();
    const receipt = receiptSchema.parse(
      await runtime.rpc('teams.run', {
        projectId: 'project',
        path: 'teams/reliability/team.yaml',
        member: 'digest',
        text: 'Report the incident.',
        requestId: 'team-once',
      }),
    );
    expect((await finished(receipt.runId)).status).toBe('completed');
    const projection = z
      .object({ messages: z.array(z.object({ text: z.string(), role: z.string() })) })
      .parse(await runtime.rpc('sessions.projection', { threadId: receipt.threadId }));
    const answer = projection.messages.find((message) => message.role === 'assistant')?.text;
    expect(answer).toContain('Keep one writer. Preserve approval holds.');
    expect(answer).toContain('Summarize actual evidence.');
    expect(answer).toContain('Report the incident.');
    expect(answer).toContain('Your team member ID: digest');
    await runtime.close();
    runtime = new AgentRuntime(directory);
    const teams = z
      .object({
        teams: z.array(
          z.object({ agents: z.array(z.object({ id: z.string(), agent: ownedAgentSchema })) }),
        ),
      })
      .parse(await runtime.rpc('teams.list', { projectId: 'project' }));
    expect(teams.teams[0]?.agents.find((member) => member.id === 'digest')?.agent).toMatchObject({
      id: digest.id,
      runCount: 1,
      lastRunStatus: 'succeeded',
    });
    expect(
      receiptSchema.parse(
        await runtime.rpc('teams.run', {
          projectId: 'project',
          path: 'teams/reliability/team.yaml',
          member: 'digest',
          text: 'Report the incident.',
          requestId: 'team-once',
        }),
      ),
    ).toEqual(receipt);
    await expect(
      runtime.rpc('teams.run', {
        projectId: 'project',
        path: 'teams/reliability/team.yaml',
        member: 'unknown',
        requestId: 'bad-member',
      }),
    ).rejects.toThrow('member');
  });
  it('adds team guidance once and sends follow-ups verbatim in the existing session', async () => {
    const { operator } = await setupTeam();
    const receipt = receiptSchema.parse(
      await runtime.rpc('agents.run', { id: operator.id, requestId: 'ordinary' }),
    );
    expect((await finished(receipt.runId)).status).toBe('completed');
    const reply = receiptSchema.parse(
      await runtime.rpc('sessions.send', {
        threadId: receipt.threadId,
        text: 'Question: <status> & “next steps”?\nSecond line.',
        messageId: 'team-follow-up',
      }),
    );
    expect((await finished(reply.runId)).status).toBe('completed');
    const projection = z
      .object({ messages: z.array(z.object({ text: z.string(), role: z.string() })) })
      .parse(await runtime.rpc('sessions.projection', { threadId: receipt.threadId }));
    const prompts = projection.messages.filter((message) => message.role === 'user');
    expect(prompts[0]?.text).toContain('Keep one writer.');
    expect(prompts[1]?.text).toBe('Question: <status> & “next steps”?\nSecond line.');
    expect(projection.messages.at(-1)?.text).toBe(
      'Question: <status> & “next steps”?\nSecond line. resumed',
    );
    expect(runtime.getAgent(operator.id).prompt).toBe('Investigate carefully.');
    expect(runtime.getAgent(operator.id).enabled).toBe(false);
  });
  it('rejects missing or cross-project agents before replacing any teams', async () => {
    const { operator, setup } = await setupTeam();
    await runtime.rpc('projects.upsert', { id: 'other', title: 'Other', workspaceRoot: directory });
    await expect(
      runtime.rpc('teams.replace', { projectId: 'other', teams: [setup] }),
    ).rejects.toThrow('unavailable agent');
    await expect(
      runtime.rpc('teams.replace', { projectId: 'project', teams: [{ ...setup, bindings: {} }] }),
    ).rejects.toThrow('unavailable agent');
    await expect(
      runtime.rpc('teams.replace', { projectId: 'project', teams: [setup, setup] }),
    ).rejects.toThrow('Duplicate team path');
    await expect(create({ ...operator, projectId: 'other' })).rejects.toThrow('Remove this agent');
    expect(
      z
        .object({ teams: z.array(z.unknown()) })
        .parse(await runtime.rpc('teams.list', { projectId: 'project' })).teams,
    ).toHaveLength(1);
    await runtime.rpc('teams.replace', { projectId: 'project', teams: [] });
    expect(
      z
        .object({ teams: z.array(z.unknown()) })
        .parse(await runtime.rpc('teams.list', { projectId: 'project' })).teams,
    ).toHaveLength(0);
  });
});

describe('factory deletion', () => {
  it('removes factory data, preserves other factories and files, and remains deleted after restart', async () => {
    const agent = await create();
    const receipt = receiptSchema.parse(
      await runtime.rpc('agents.run', { id: agent.id, requestId: 'delete-me' }),
    );
    await finished(receipt.runId);
    await runtime.rpc('projects.upsert', { id: 'other', title: 'Other', workspaceRoot: directory });
    const other = await create({ projectId: 'other' });
    runtime.store.put('teams', JSON.stringify(['project', 'team.yaml']), { projectId: 'project' });
    runtime.store.put('archives', 'archive', { thread: { projectId: 'project' } });
    runtime.store.put('deliveries', 'delivery', { agentId: agent.id });
    await writeFile(join(directory, 'project-file.txt'), 'Keep me');
    expect(await runtime.rpc('projects.delete', { id: 'project' })).toEqual({ deleted: true });
    await runtime.close();
    runtime = new AgentRuntime(directory);
    expect(await runtime.rpc('agents.list', {})).toMatchObject({ tasks: [{ id: other.id }] });
    expect(await runtime.rpc('workspace.snapshot', {})).toMatchObject({
      snapshot: { projects: [{ id: 'other' }], threads: [] },
    });
    for (const table of [
      'runs',
      'messages',
      'receipts',
      'deliveries',
      'teams',
      'archives',
    ] as const) {
      expect(runtime.store.all(table, z.unknown())).toEqual([]);
    }
    expect(runtime.store.get('secrets', agent.id, z.unknown())).toBeNull();
    expect(await readFile(join(directory, 'project-file.txt'), 'utf8')).toBe('Keep me');
    expect(await runtime.rpc('projects.delete', { id: 'project' })).toEqual({ deleted: true });
  });

  it('refuses to delete a factory with an active run', async () => {
    const agent = await create({ prompt: 'HOLD' });
    const receipt = receiptSchema.parse(
      await runtime.rpc('agents.run', { id: agent.id, requestId: 'active' }),
    );
    await expect(runtime.rpc('projects.delete', { id: 'project' })).rejects.toThrow(
      'Stop active runs',
    );
    expect(runtime.getAgent(agent.id).id).toBe(agent.id);
    await runtime.rpc('sessions.stop', { threadId: receipt.threadId });
  });
});
