import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { createOpenFactoryMcpServer } from './server';

const port = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .parse(process.env.OPENFACTORY_MCP_PORT ?? 8022);
const directory =
  process.env.OPENFACTORY_RUNTIME_DIR ?? join(homedir(), '.config/openfactory/runtime');
process.env.NODE_ENV = 'production';
const server = await createOpenFactoryMcpServer(directory, port);
await server.listen(port);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
