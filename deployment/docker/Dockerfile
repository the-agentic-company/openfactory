FROM --platform=$BUILDPLATFORM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS build
RUN npm install --global pnpm@12.15.0
WORKDIR /source
COPY . .
RUN --mount=type=cache,id=openfactory-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir=/pnpm/store
RUN pnpm build:app && mkdir /data && chown node:node /data
# The dashboard must remain architecture-independent; agent execution is remote.
RUN node -e "const fs=require('node:fs'); if(fs.readdirSync('apps/app/.output',{recursive:true}).some(p=>p.endsWith('.node'))) throw Error('Native addon requires a target-platform build')"

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
ENV NODE_ENV=production HOME=/data OPENFACTORY_SETTINGS_DIR=/data/workspace OPENFACTORY_READ_CACHE=/data/cache OPENFACTORY_HISTORY_DIR=/data/history OPENFACTORY_AUTH_DIR=/data/auth
WORKDIR /app
COPY --from=build --chown=node:node /source/apps/app/.output /app/web
COPY --from=build --chown=node:node /source/LICENSE /source/THIRD_PARTY_NOTICES.md /app/
COPY --chown=node:node deployment/docker/gateway.mjs deployment/docker/entrypoint.mjs /app/
COPY --from=build --chown=node:node /data /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(r.status!==200&&r.status!==303)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "/app/entrypoint.mjs"]
