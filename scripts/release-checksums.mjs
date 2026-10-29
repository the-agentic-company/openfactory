import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const directory = resolve(process.argv[2] ?? 'apps/desktop/dist');
const names = (await readdir(directory))
  .filter((name) => /\.(?:dmg|zip|deb|AppImage|exe|tar\.gz)$/.test(name))
  .sort();
if (names.length === 0) {
  throw new Error('There are no release assets to checksum.');
}
const lines = [];
for (const name of names) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(directory, name))) {
    hash.update(chunk);
  }
  lines.push(`${hash.digest('hex')}  ${name}\n`);
}
await writeFile(join(directory, 'SHA256SUMS'), lines.join(''));
process.stdout.write(`Wrote SHA256SUMS for ${names.length} release assets.\n`);
