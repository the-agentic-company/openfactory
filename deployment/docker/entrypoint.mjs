import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['/app/web/server/index.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, HOST: '127.0.0.1', PORT: '8019' },
  }),
  spawn(process.execPath, ['/app/gateway.mjs'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 5000).unref();
  void Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => child.once('exit', resolve)),
    ),
  ).then(() => process.exit(code));
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code ?? 1));
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0));
}
