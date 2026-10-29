import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.github/assets/readme');
const session = `openfactory-animation-${process.pid}`;
const temporary = await mkdtemp(join(tmpdir(), 'openfactory-animation-'));
const fps = 20;
const duration = 11.5;
const browser = (...args) =>
  execFileSync('agent-browser', ['--session', session, '--args', '--no-sandbox', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
const ffmpeg = (...args) =>
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-threads',
      '2',
      '-filter_complex_threads',
      '2',
      '-y',
      ...args,
    ],
    {
      stdio: 'inherit',
    },
  );
let socket;
try {
  await mkdir(output, { recursive: true });
  const url = pathToFileURL(join(root, 'scripts/readme-animation.html')).href;
  browser('open', url);
  browser('set', 'viewport', '1280', '720');
  const browserUrl = new URL(browser('get', 'cdp-url'));
  const targets = await fetch(`http://${browserUrl.host}/json/list`).then((r) => r.json());
  const target = targets.find((page) => page.url === url);
  if (!target?.webSocketDebuggerUrl) {
    throw new Error('Animation browser tab was not found.');
  }
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const response = JSON.parse(data);
    const request = pending.get(response.id);
    if (!request) {
      return;
    }
    pending.delete(response.id);
    if (response.error) {
      request.reject(new Error(response.error.message));
    } else {
      request.resolve(response.result);
    }
  });
  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails));
    }
  };
  await evaluate(
    "window.exporting=true;document.querySelector('.replay').remove();document.fonts.ready",
  );
  for (let frame = 0; frame < fps * duration; frame++) {
    await evaluate(`render(${(frame / fps) * 1000})`);
    const capture = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      join(temporary, `frame-${String(frame).padStart(4, '0')}.png`),
      Buffer.from(capture.data, 'base64'),
    );
    if (frame === 180) {
      await writeFile(join(output, 'openfactory-concept.png'), Buffer.from(capture.data, 'base64'));
    }
  }
  ffmpeg(
    '-framerate',
    String(fps),
    '-i',
    join(temporary, 'frame-%04d.png'),
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    join(output, 'openfactory-concept.mp4'),
  );
  ffmpeg(
    '-i',
    join(output, 'openfactory-concept.mp4'),
    '-filter_complex',
    'fps=15,scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    '-loop',
    '0',
    join(output, 'openfactory-concept.gif'),
  );
  console.log(`Exported GIF, MP4, and poster to ${output}`);
} finally {
  socket?.close();
  browser('close');
  await rm(temporary, { recursive: true, force: true });
}
