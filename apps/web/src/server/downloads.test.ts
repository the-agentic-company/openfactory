import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vite-plus/test';
import { desktopBuilds } from '../download-builds';
import { downloadBuild } from './downloads';

it('downloads the exact build bytes and provides metadata without reading a HEAD body', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openfactory-download-'));
  const previous = process.env.OPENFACTORY_DOWNLOADS_DIR;
  process.env.OPENFACTORY_DOWNLOADS_DIR = directory;
  try {
    const file = desktopBuilds[0].file;
    const bytes = new Uint8Array([80, 75, 3, 4, 128, 255]);
    await writeFile(join(directory, file), bytes);
    const head = await downloadBuild(file, true);
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe(String(bytes.length));
    expect(head.headers.get('Content-Disposition')).toBe(`attachment; filename="${file}"`);
    expect(await head.text()).toBe('');
    const response = await downloadBuild(file);
    expect(response.headers.get('Content-Type')).toBe('application/zip');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect((await downloadBuild(desktopBuilds[1].file)).status).toBe(404);
    expect((await downloadBuild('../package.json')).status).toBe(404);
  } finally {
    if (previous === undefined) {
      delete process.env.OPENFACTORY_DOWNLOADS_DIR;
    } else {
      process.env.OPENFACTORY_DOWNLOADS_DIR = previous;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
