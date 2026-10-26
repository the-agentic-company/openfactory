# Blackhole Generator

A software factory starter based on Mibba's TypeScript workspace boundaries, using pnpm and Vite+.

## Development

Use Node 26 (`.node-version`) and pnpm 12.15.0 (`packageManager`).

```sh
pnpm install
pnpm dev
```

The development server binds to `0.0.0.0:8018` with strict port selection. Open <http://localhost:8018>. If the port is occupied, startup fails instead of choosing another port.

Vite+ is installed locally. Use `pnpm exec vp` for its CLI; a global installation is optional.

```sh
pnpm check          # Oxfmt, Oxlint and type-aware checks
pnpm format         # Write formatting fixes
pnpm test           # Vitest through Vite+
pnpm build          # Workspace builds through Vite Task
pnpm ready          # Checks, tests and builds
pnpm exec vp run    # Workspace task menu
```

## Workspace

| Path              | Responsibility                                                             |
| ----------------- | -------------------------------------------------------------------------- |
| `apps/web`        | React, TanStack Start, Router, Query, Table, Virtual, Tailwind and Zustand |
| `packages/core`   | Domain logic, Zod validation and Effect                                    |
| `packages/config` | Stable application defaults and shared strict TypeScript settings          |
| `packages/db`     | PostgreSQL schema, Drizzle and an explicit connection factory              |

Package boundaries use `workspace:*`. Application packages consume shared TypeScript sources. Vite+'s root `vite.config.ts` owns formatting, linting, tests and task caching. The web package owns framework plugins and server settings. Vite+ supplies Vite, Vitest, Oxlint and Oxfmt, plus the workspace task runner.

`apps/web/src/server/workspace.ts` demonstrates a Zod-validated TanStack Start server function. TanStack Query calls it when filtering or refreshing the stack. The inventory uses TanStack Table v9 and TanStack Virtual. The server-rendered page is available without database credentials.

## Database

`packages/db` provides a sample `projects` schema and `createDatabase(connectionString)`. No connection opens at import time. A real PostgreSQL connection is required only when using persistence. Pass `DATABASE_URL` in your shell before running `pnpm --filter @factory/db db:push` or `db:studio`. Close the returned pool with `close()` when its owner shuts down.

## Template decisions

- pnpm replaces Bun for dependency management and scripts; Node runs the application.
- Vite+ owns the unified toolchain and workspace task runner.
- TanStack Start server functions provide the typed server boundary; oRPC is excluded.
- Turbopuffer, Chonkie, LiteParse, PaddleOCR, Tesseract, Sharp, FlexSearch and Fuse are excluded.
- Authentication, background workers, AI runtimes, deployment infrastructure and production observability remain future template choices. They are not configured by this starter.

## Production build

```sh
pnpm build
PORT=8018 pnpm --filter @factory/web start
```

Nitro produces `apps/web/.output/server/index.mjs` and the associated public assets. Stop the development server before running the production server on the same port.
