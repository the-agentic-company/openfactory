import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));
process.on('message', (message) => {
  if (message.type === 'connection') {
    if (process.env.OPENFACTORY_DESKTOP_CONNECTION_FILE) {
      const path = process.env.OPENFACTORY_DESKTOP_CONNECTION_FILE;
      writeFileSync(
        `${path}.tmp`,
        JSON.stringify({ origin: message.origin, token: message.token }),
        { mode: 0o600 },
      );
      renameSync(`${path}.tmp`, path);
    } else {
      process.env.OPENFACTORY_RUNTIME_ORIGIN = message.origin;
      process.env.OPENFACTORY_RUNTIME_TOKEN = message.token;
    }
    process.send?.({ type: 'selected', requestId: message.requestId });
  }
});
process.on('disconnect', () => process.exit(0));
if (process.env.OPENFACTORY_DESKTOP_DEV === '1') {
  const webRoot = join(root, '../../app');
  const require = createRequire(join(webRoot, 'package.json'));
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  process.chdir(webRoot);
  const port = Number(process.env.PORT);
  const server = await createServer({
    root: webRoot,
    configFile: join(webRoot, 'vite.config.ts'),
    plugins: [
      {
        name: 'desktop-development-icon',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            const pathname = request.url?.split('?')[0];
            if (!['/openfactory.png', '/favicon.png', '/favicon.ico'].includes(pathname)) {
              next();
              return;
            }
            response.setHeader('Content-Type', 'image/png');
            response.setHeader('Cache-Control', 'no-store');
            const asset =
              pathname === '/openfactory.png' ? 'development-logo.png' : 'development-icon.png';
            response.end(readFileSync(join(root, 'ui', asset)));
          });
        },
      },
    ],
    server: { host: '127.0.0.1', port, strictPort: true, open: false },
  });
  await server.listen();
  process.send?.({ type: 'ready' });
  server.printUrls();
} else {
  await import(pathToFileURL(join(root, '../web/server/index.mjs')).href);
}
