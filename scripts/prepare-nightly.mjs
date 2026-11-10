import { readFileSync, writeFileSync } from 'node:fs';

const run = process.env.GITHUB_RUN_NUMBER;
if (!/^[1-9]\d*$/.test(run ?? '')) {
  throw new Error('Nightly builds require GITHUB_RUN_NUMBER.');
}
const path = new URL('../apps/desktop/package.json', import.meta.url);
const desktop = JSON.parse(readFileSync(path, 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(desktop.version)) {
  throw new Error('The desktop package must have a stable version before preparing a nightly.');
}
const [major, minor, patch] = desktop.version.split('.').map(Number);
desktop.version = `${major}.${minor}.${patch + 1}-nightly.${run}`;
writeFileSync(path, `${JSON.stringify(desktop, null, 2)}\n`);
process.stdout.write(`Nightly version: ${desktop.version}\n`);
