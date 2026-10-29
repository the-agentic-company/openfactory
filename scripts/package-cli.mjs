import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'apps/desktop/package.json'), 'utf8'));
const output = join(root, 'apps/desktop/dist');
const targets = process.argv.slice(2);
if (targets.length === 0) {
  targets.push(`${process.platform}-${process.arch}`);
}
const supported = new Set(['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64']);
for (const target of targets) {
  if (!supported.has(target)) {
    throw new Error(`Unsupported CLI target: ${target}`);
  }
}
await mkdir(output, { recursive: true });

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

for (const target of targets) {
  const staging = await mkdtemp(join(tmpdir(), 'openfactory-cli-'));
  try {
    const stem = `openfactory-cli-${version}-${target}`;
    const directory = join(staging, stem);
    await mkdir(directory);
    if (target === `${process.platform}-${process.arch}`) {
      await copyFile(process.execPath, join(directory, 'node'));
      await copyFile(
        resolve(dirname(process.execPath), '../LICENSE'),
        join(directory, 'NODE-LICENSE'),
      );
    } else {
      const nodeStem = `node-v${process.versions.node}-${target}`;
      const archive = `${nodeStem}.tar.gz`;
      const base = `https://nodejs.org/dist/v${process.versions.node}`;
      const sums = (await download(`${base}/SHASUMS256.txt`)).toString('utf8');
      const expected = sums
        .split('\n')
        .map((line) => line.trim().split(/\s+/))
        .find(([, name]) => name === archive)?.[0];
      if (!expected) {
        throw new Error(`${archive} is not in Node's published checksums.`);
      }
      const bytes = await download(`${base}/${archive}`);
      if (createHash('sha256').update(bytes).digest('hex') !== expected) {
        throw new Error(`Node archive checksum mismatch: ${archive}`);
      }
      await writeFile(join(staging, archive), bytes);
      await exec('tar', [
        '-xzf',
        join(staging, archive),
        '-C',
        staging,
        `${nodeStem}/bin/node`,
        `${nodeStem}/LICENSE`,
      ]);
      await copyFile(join(staging, nodeStem, 'bin/node'), join(directory, 'node'));
      await copyFile(join(staging, nodeStem, 'LICENSE'), join(directory, 'NODE-LICENSE'));
    }
    await chmod(join(directory, 'node'), 0o755);
    await copyFile(join(root, 'packages/runtime/dist/runtime.mjs'), join(directory, 'runtime.mjs'));
    await copyFile(join(root, 'LICENSE'), join(directory, 'LICENSE'));
    await copyFile(join(root, 'THIRD_PARTY_NOTICES.md'), join(directory, 'THIRD_PARTY_NOTICES.md'));
    await copyFile(join(root, 'third-party/T3-CODE-LICENSE'), join(directory, 'T3-CODE-LICENSE'));
    await writeFile(join(directory, 'VERSION'), `${version}\n`);
    await writeFile(
      join(directory, 'openfactory'),
      `#!/bin/sh
set -eu
self=$0
while [ -L "$self" ]; do
  base=$(CDPATH= cd -P -- "$(dirname -- "$self")" && pwd)
  link=$(readlink "$self")
  case "$link" in /*) self=$link ;; *) self=$base/$link ;; esac
done
directory=$(CDPATH= cd -P -- "$(dirname -- "$self")" && pwd)
case "\${1:-}" in
  --version|-v) cat "$directory/VERSION"; exit 0 ;;
  --help|-h|help|'')
    printf '%s\\n' 'OpenFactory CLI' '' 'Usage: openfactory <command>' '' '  serve                      Start the local agent runtime' '  status                     Inspect the running runtime' '  project <path> [name]      Register a project' '  agents                     List agents' '  run <agent-id>             Start an agent run' '  team-apply <project> <file> Apply a team definition' '' 'Install Codex CLI or Claude Code CLI separately to run agents.'
    exit 0 ;;
esac
exec "$directory/node" "$directory/runtime.mjs" "$@"
`,
      { mode: 0o755 },
    );
    await exec('tar', ['-czf', join(output, `${stem}.tar.gz`), '-C', staging, stem]);
    process.stdout.write(
      `Created ${stem}.tar.gz with Node ${process.versions.node} and its license.\n`,
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
