import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

export function reportingSocketPath(directory, platform = process.platform) {
  return platform === 'win32'
    ? `\\\\.\\pipe\\openfactory-reporting-${createHash('sha256').update(resolve(directory)).digest('hex')}`
    : join(directory, 'reporting.sock');
}
