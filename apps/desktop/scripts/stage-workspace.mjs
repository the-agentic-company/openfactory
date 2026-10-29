import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
rmSync(join(root, 'web'), { recursive: true, force: true });
cpSync(join(root, '../web/.output'), join(root, 'web'), { recursive: true, dereference: true });
mkdirSync(join(root, 'runtime'), { recursive: true });
cpSync(join(root, '../../packages/runtime/dist/runtime.mjs'), join(root, 'runtime/runtime.mjs'));
