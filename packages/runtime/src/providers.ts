import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import type { Session } from './contracts';
import { usageSchema } from './contracts';

type ProviderEvent =
  | { type: 'session'; id: string }
  | { type: 'message'; id: string; text: string }
  | { type: 'usage'; usage: z.infer<typeof usageSchema> }
  | { type: 'completed' }
  | { type: 'error'; message: string };
const envelopeSchema = z.object({ type: z.string() }).passthrough();
const codexUsageSchema = z.object({
  input_tokens: z.number(),
  cached_input_tokens: z.number().default(0),
  cache_write_input_tokens: z.number().default(0),
  output_tokens: z.number(),
});
const claudeUsageSchema = z.object({
  input_tokens: z.number().default(0),
  cache_read_input_tokens: z.number().default(0),
  cache_creation_input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
});

export function parseProviderEvent(provider: string, source: string): ProviderEvent[] {
  const raw = envelopeSchema.parse(JSON.parse(source));
  if (provider === 'codex') {
    switch (raw.type) {
      case 'thread.started':
        return [{ type: 'session', id: z.string().parse(raw.thread_id) }];
      case 'item.completed': {
        const item = envelopeSchema.parse(raw.item);
        if (item.type !== 'agent_message') {
          return [];
        }
        const message = z.object({ id: z.string(), text: z.string() }).parse(item);
        return [{ type: 'message', ...message }];
      }
      case 'turn.completed': {
        const usage = codexUsageSchema.parse(raw.usage);
        return [
          {
            type: 'usage',
            usage: {
              input: usage.input_tokens - usage.cached_input_tokens,
              cached: usage.cached_input_tokens,
              cacheWrite: usage.cache_write_input_tokens,
              output: usage.output_tokens,
              costUsd: null,
            },
          },
          { type: 'completed' },
        ];
      }
      case 'turn.failed':
        return [
          { type: 'error', message: z.object({ message: z.string() }).parse(raw.error).message },
        ];
      case 'error':
        return [{ type: 'error', message: z.string().parse(raw.message) }];
      default:
        return [];
    }
  }
  switch (raw.type) {
    case 'system': {
      if (raw.subtype !== 'init') {
        return [];
      }
      return [{ type: 'session', id: z.string().parse(raw.session_id) }];
    }
    case 'assistant': {
      const message = z
        .object({
          id: z.string(),
          content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
        })
        .parse(raw.message);
      return [
        {
          type: 'message',
          id: message.id,
          text: message.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text ?? '')
            .join('\n'),
        },
      ];
    }
    case 'result': {
      const result = z
        .object({
          session_id: z.string(),
          is_error: z.boolean(),
          result: z.string().optional(),
          errors: z.array(z.string()).optional(),
          usage: claudeUsageSchema.optional(),
        })
        .parse(raw);
      const events: ProviderEvent[] = [{ type: 'session', id: result.session_id }];
      if (result.is_error) {
        events.push({
          type: 'error',
          message: result.errors?.join('\n') || result.result || 'Claude execution failed.',
        });
      } else {
        if (result.usage) {
          events.push({
            type: 'usage',
            usage: {
              input: result.usage.input_tokens,
              cached: result.usage.cache_read_input_tokens,
              cacheWrite: result.usage.cache_creation_input_tokens,
              output: result.usage.output_tokens,
              costUsd: null,
            },
          });
        }
        events.push({ type: 'completed' });
      }
      return events;
    }
    default:
      return [];
  }
}

export function providerCommand(session: Session) {
  const { instanceId, model, options } = session.modelSelection;
  if (instanceId === 'codex') {
    const args = ['exec'];
    if (session.nativeSessionId) {
      args.push('resume');
    }
    args.push(
      '--json',
      '--skip-git-repo-check',
      '--model',
      model,
      '--config',
      'approval_policy="never"',
    );
    const sandbox =
      session.interactionMode !== 'plan' && session.runtimeMode === 'full-access'
        ? 'danger-full-access'
        : session.interactionMode !== 'plan' && session.runtimeMode === 'auto-accept-edits'
          ? 'workspace-write'
          : 'read-only';
    args.push('--config', `sandbox_mode=${JSON.stringify(sandbox)}`);
    const effort = options?.reasoningEffort;
    if (typeof effort === 'string') {
      args.push('--config', `model_reasoning_effort=${JSON.stringify(effort)}`);
    }
    const tier = options?.serviceTier;
    if (typeof tier === 'string' && tier !== 'default') {
      args.push('--config', `service_tier=${JSON.stringify(tier)}`);
    }
    if (session.nativeSessionId) {
      args.push(session.nativeSessionId);
    }
    args.push('-');
    return { binary: process.env.OPENFACTORY_CODEX_BIN ?? 'codex', args };
  }
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', model];
  if (session.nativeSessionId) {
    args.push('--resume', session.nativeSessionId);
  }
  if (session.interactionMode === 'plan' || session.runtimeMode === 'approval-required') {
    args.push('--permission-mode', 'plan');
  } else if (session.runtimeMode === 'full-access') {
    args.push('--permission-mode', 'bypassPermissions');
  } else if (session.runtimeMode === 'auto-accept-edits') {
    args.push('--permission-mode', 'acceptEdits');
  } else {
    args.push('--permission-mode', 'dontAsk');
  }
  return { binary: process.env.OPENFACTORY_CLAUDE_BIN ?? 'claude', args };
}

export function launchProvider(
  session: Session,
  prompt: string,
  onEvent: (event: ProviderEvent) => void,
  onLine: (line: string) => void,
) {
  const command = providerCommand(session);
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^T3_|^T3CODE_|^CLAUDECODE$|^CODEX_THREAD_ID$/.test(key)) {
      delete env[key];
    }
  }
  const child = spawn(command.binary, command.args, {
    cwd: session.cwd,
    env,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  let failed: string | null = null;
  let completed = false;
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on('line', (line) => {
    try {
      if (line.length > 8_000_000) {
        throw new Error('Provider event exceeds 8 MB.');
      }
      onLine(line);
      for (const event of parseProviderEvent(session.modelSelection.instanceId, line)) {
        if (event.type === 'error') {
          failed = event.message;
        }
        if (event.type === 'completed') {
          completed = true;
        }
        onEvent(event);
      }
    } catch (error) {
      failed = error instanceof Error ? error.message : 'Invalid provider output.';
      child.kill('SIGTERM');
    }
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString('utf8')).slice(-4000);
  });
  child.stdin.on('error', () => {
    /* A failed launch may close stdin before the prompt is written. */
  });
  child.stdin.end(prompt);
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', (error) =>
      reject(new Error(`Cannot start ${command.binary}: ${error.message}`)),
    );
    child.on('close', (code) => {
      if (code === 0 && completed && !failed) {
        resolve();
      } else {
        reject(
          new Error(
            failed ?? (stderr || `Provider exited with code ${code} before completing the turn.`),
          ),
        );
      }
    });
  });
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const signal = (name: NodeJS.Signals) => {
    try {
      if (child.pid && process.platform !== 'win32') {
        process.kill(-child.pid, name);
      } else {
        child.kill(name);
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
        throw error;
      }
    }
  };
  void done.finally(() => clearTimeout(killTimer)).catch(() => {});
  return {
    done,
    stop() {
      signal('SIGTERM');
      killTimer = setTimeout(() => signal('SIGKILL'), 5000);
      killTimer.unref();
    },
  };
}
