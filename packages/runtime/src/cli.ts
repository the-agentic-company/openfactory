import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, basename } from 'node:path';
import { runtimeDirectory, runtimeRpc } from './client';
import { serveRuntime } from './server';
import { applyTeamFile } from './team-files';

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'serve') {
    const server = await serveRuntime(runtimeDirectory());
    process.stdout.write(`OpenFactory runtime listening in ${runtimeDirectory()}\n`);
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        void server.close().then(() => process.exit(0));
      });
    }
  } else {
    let result: unknown;
    switch (command) {
      case 'status':
        result = await runtimeRpc('runtime.status', {});
        break;
      case 'team-apply':
        result = await applyTeamFile(args[0] ?? '', resolve(args[1] ?? 'team.yaml'), runtimeRpc);
        break;
      case 'teams':
        result = await runtimeRpc('teams.list', { projectId: args[0] });
        break;
      case 'team-run': {
        const text = args[3] === '-' ? await readFile('/dev/stdin', 'utf8') : args[3];
        result = await runtimeRpc('teams.run', {
          projectId: args[0],
          path: args[1],
          member: args[2],
          text,
          requestId: args[4] ?? randomUUID(),
        });
        break;
      }
      case 'agents':
        result = await runtimeRpc('agents.list', {});
        break;
      case 'project': {
        const path = resolve(args[0] ?? '.');
        result = await runtimeRpc('projects.upsert', {
          id: path,
          title: args[1] ?? basename(path),
          workspaceRoot: path,
        });
        break;
      }
      case 'run':
        result = await runtimeRpc('agents.run', {
          id: args[0],
          requestId: args[1] ?? randomUUID(),
        });
        break;
      case 'pause':
      case 'resume':
        result = await runtimeRpc('agents.setEnabled', {
          id: args[0],
          enabled: command === 'resume',
        });
        break;
      case 'read':
        result = await runtimeRpc('sessions.read', { threadId: args[0] });
        break;
      case 'send': {
        const text = args[1] === '-' ? await readFile('/dev/stdin', 'utf8') : args[1];
        result = await runtimeRpc('sessions.send', {
          threadId: args[0],
          text,
          messageId: args[2] ?? randomUUID(),
        });
        break;
      }
      case 'stop':
        result = await runtimeRpc('sessions.stop', { threadId: args[0] });
        break;
      case 'create':
        result = await runtimeRpc(
          'agents.upsert',
          JSON.parse(await readFile(args[0] ?? '/dev/stdin', 'utf8')),
        );
        break;
      case 'webhook-secret':
        result = await runtimeRpc('agents.webhookSecret', {
          id: args[0],
          secret: (await readFile(args[1], 'utf8')).trim(),
        });
        break;
      default:
        throw new Error(
          'Usage: pnpm openfactory serve | status | project <path> [name] | team-apply <project-id> <path/to/team.yaml> | teams <project-id> | team-run <project-id> <teams/name/team.yaml> <member> [text|-] [request-id] | agents | create <json-file> | run <agent-id> [request-id] | pause/resume <agent-id> | read/stop <session-id> | send <session-id> <text|-> [request-id] | webhook-secret <agent-id> <secret-file>',
        );
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
