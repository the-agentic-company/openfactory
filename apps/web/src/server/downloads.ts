import { open, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { desktopBuilds } from '../download-builds';

export async function downloadBuild(file: string, head = false) {
  if (!desktopBuilds.some((build) => build.file === file)) {
    return new Response('Build not found.', { status: 404 });
  }
  const directory =
    process.env.OPENFACTORY_DOWNLOADS_DIR ?? resolve(process.cwd(), '../desktop/dist');
  const path = join(directory, file);
  try {
    const info = await stat(path);
    const headers = {
      'Content-Type': file.endsWith('.dmg')
        ? 'application/x-apple-diskimage'
        : file.endsWith('.AppImage')
          ? 'application/octet-stream'
          : file.endsWith('.exe')
            ? 'application/vnd.microsoft.portable-executable'
            : 'application/vnd.debian.binary-package',
      'Content-Disposition': `attachment; filename="${file}"`,
      'Content-Length': String(info.size),
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    };
    if (head) {
      return new Response(null, { headers });
    }
    const handle = await open(path);
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = new Uint8Array(64 * 1024);
          const { bytesRead } = await handle.read(chunk);
          if (bytesRead === 0) {
            controller.close();
            await handle.close();
          } else {
            controller.enqueue(chunk.subarray(0, bytesRead));
          }
        } catch (error) {
          controller.error(error);
          await handle.close();
        }
      },
      cancel: () => handle.close(),
    });
    return new Response(body, { headers });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return new Response('This build is not available yet.', { status: 404 });
    }
    throw error;
  }
}
