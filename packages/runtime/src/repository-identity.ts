import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export function normalizeRepositoryRemote(remote: string): string | null {
  const value = remote.trim();
  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(value);
  try {
    const url = new URL(scp && !value.includes('://') ? `ssh://${scp[1]}/${scp[2]}` : value);
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) {
      return null;
    }
    const path = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
    return path ? `${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${path}` : null;
  } catch {
    return null;
  }
}

export async function repositoryIdentity(cwd: string) {
  async function git(args: string[]) {
    try {
      return (await execute('git', args, { cwd, timeout: 3000, maxBuffer: 65536 })).stdout.trim();
    } catch {
      return null;
    }
  }
  const [remote, branch, commit] = await Promise.all([
    git(['remote', 'get-url', 'origin']),
    git(['branch', '--show-current']),
    git(['rev-parse', 'HEAD']),
  ]);
  return { repository: remote ? normalizeRepositoryRemote(remote) : null, branch, commit };
}
