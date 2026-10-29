import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = dirname(fileURLToPath(import.meta.url));
process.on('message', (message) => {
  if (message.type === 'connection') {
    process.env.OPENFACTORY_RUNTIME_ORIGIN = message.origin;
    process.env.OPENFACTORY_RUNTIME_TOKEN = message.token;
    process.env.OPENFACTORY_SETTINGS_DIR = message.settingsDir;
    process.send?.({ type: 'selected' });
  }
});
process.on('disconnect', () => process.exit(0));
if (process.env.OPENFACTORY_DESKTOP_DEV === '1') {
  const webRoot = join(root, '../../web');
  const require = createRequire(join(webRoot, 'package.json'));
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  process.chdir(webRoot);
  const port = Number(process.env.PORT);
  const server = await createServer({
    root: webRoot,
    configFile: join(webRoot, 'vite.config.ts'),
    server: { host: '127.0.0.1', port, strictPort: true, open: false },
  });
  await server.listen();
  server.printUrls();
} else {
  await import(pathToFileURL(join(root, '../web/server/index.mjs')).href);
}
