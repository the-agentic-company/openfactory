---
name: observability
description: Diagnose Mibba runtime problems and verify its local or AWS production observability stack using Grafana, VictoriaLogs, VictoriaMetrics, VictoriaTraces, Vector, vmalert, Alertmanager, Pyrra-generated SLO rules, CloudWatch logs, and mibba.co. Use when asked to inspect logs, traces, metrics, dashboards, alerts, SLOs, telemetry ingestion, cloud observability, or observability connectivity, or when debugging a Mibba issue needs operational evidence.
---

# Mibba observability

Read `docs/observability.md` first. Treat it as the canonical port and startup reference, then inspect `docker-compose.yml` and `observability/` when the deployed configuration matters.

## Start the local stack

Run:

```sh
bun run docker:observability:up
docker compose ps
```

Run `bun run dev` in the shared tmux session required by `AGENTS.md`. Do not launch a second unmanaged dev server. If telemetry configuration changed or the dev process started before the stack, restart the tmux-managed process before testing application emission.

## Inspect AWS production

Production runs on ECS Fargate in `eu-west-3` (Paris). Use the production member-account profile and that region for every AWS call. The legacy `mibba-admin` profile points at the vacated management account and has no production ECS resources:

```sh
export AWS_PROFILE=mibba-production
export AWS_REGION=eu-west-3
```

Keep production checks read-only and low-volume. Do not stop tasks, force a new deployment, scale a service, change task definitions or Parameter Store values, inject alerts, or submit authenticated product data unless the user explicitly requests it.

Discover what is actually running rather than hardcoding names:

```sh
aws ecs list-services --cluster mibba-prod
aws ecs describe-services --cluster mibba-prod --services <arns…>
```

The Fargate services are `web`, `worker`, `mcp`, and `zero`. Check each service's desired/running task count, deployment rollout state, and recent service events before interpreting telemetry.

Container logs go to CloudWatch under `/aws/ecs/mibba/prod/<service>`:

```sh
aws logs describe-log-groups --log-group-name-prefix /aws/ecs/mibba/prod
aws logs tail /aws/ecs/mibba/prod/web --since 30m --format short
```

Use a bounded time range and a conservative limit; `aws logs filter-log-events` with `--start-time` works when you need a specific pattern. CloudWatch is the platform-level record — container startup, crash loops, and anything emitted before the telemetry pipeline is ready. Application-level structured logs still live in VictoriaLogs. Redact credentials and sensitive case data before reporting log messages.

Test `https://mibba.co` as a real browser user. Verify the landing page, the `/app` to `/login` redirect for an unauthenticated session, browser console/page errors, and TLS. Do not log in without a user-provided authenticated browser state.

Sentry is unchanged by the move to AWS: it remains the exception-triage path for the web browser/server, worker, and MCP runtimes. See `SENTRY.md`.

The staging and production observability backends stay private. Each environment's box (`mibba-obs-staging`, `mibba-obs-prod`) is its own Tailscale node running a Caddy container that terminates TLS with publicly trusted certificates; the public A records are DNS-only and point at the box's `100.x` Tailscale address, so the names resolve for everyone but only the tailnet can reach the listener.

Before touching any of these endpoints, confirm the tailnet is up and the target name resolves:

```sh
tailscale status
dig +short grafana.ops.prod.mibba.co
```

If Tailscale is down, or the hostname does not resolve, stop and tell the user Tailscale appears to be off and must be started first. Do not disable TLS verification to get around it, and do not report the backend as down — an unreachable tailnet is not evidence about the service.

Production:

- `https://grafana.ops.prod.mibba.co`
- `https://victoria-metrics.ops.prod.mibba.co`
- `https://victoria-logs.ops.prod.mibba.co`
- `https://victoria-traces.ops.prod.mibba.co`

Staging:

- `https://grafana.ops.staging.mibba.co`
- `https://victoria-metrics.ops.staging.mibba.co`
- `https://victoria-logs.ops.staging.mibba.co`
- `https://victoria-traces.ops.staging.mibba.co`

vmalert and Alertmanager have no public hostname; reach them directly through the observability node's Tailscale MagicDNS name at `http://mibba-obs-<environment>:8880` and `http://mibba-obs-<environment>:9093`. The `obs.<environment>.mibba.internal` names are Route53 private-zone records for ECS tasks inside the AWS VPC and are not expected to resolve on operator workstations. When the box itself is under investigation, `aws ssm start-session` reaches it without the tailnet, and `curl --resolve <hostname>:443:127.0.0.1` exercises the public TLS hostname on the box with the certificate still validated. Report public DNS and direct tailnet reachability separately. Never disable TLS verification.

Grafana production requires authentication. A `401` from an unauthenticated request is expected; use an approved credential source without printing credentials. Treat successful login with a vendor default credential as a critical security finding. Validate every Grafana data source through its health API: a running Grafana process and provisioned dashboard files do not prove its backend hostnames resolve in the deployed environment.

Query current production signals directly through the private Victoria endpoints when Grafana is unavailable. Validate `app_runtime_up`, recent structured records for `mibba-web` and `mibba-worker`, Jaeger service/trace discovery, `/api/v1/rules`, `/api/v1/alerts`, and recent Vector component error/discard counters. Compare `deployment_environment` labels across web and worker; production telemetry labeled `development` is misconfigured.

Use Alertmanager or CloudWatch logs to verify notification delivery, not merely alert evaluation. A firing vmalert rule with a Slack `not_authed` response means detection works but notification delivery does not.

## Investigate an issue

1. Establish the affected time window, service, route or job, user-visible symptom, and any known trace ID. State assumptions when one is missing.
2. Confirm the relevant services and data sources are healthy before interpreting missing telemetry as evidence.
3. Search VictoriaLogs for the narrowest useful stream, usually starting with `service:mibba-web` or `service:mibba-worker`, then add `level:error`, `event:...`, route, queue, instance, worktree slot, or trace ID fields.
4. Pivot from a log `traceId` to VictoriaTraces. Use the Jaeger-compatible API under `/select/jaeger` or Grafana Explore.
5. Query VictoriaMetrics for the matching rate, error, queue, RPC, or SLO series. Inspect labels and live metric names rather than assuming copied Bap names are still correct.
6. Inspect vmalert rule health and Alertmanager only after confirming their metric dependencies exist.
7. Report facts separately from inferences. Include exact queries, time bounds, trace IDs, and missing expected signals.

## Verify connections end to end

Distinguish these levels in the final inventory:

- **Process:** container is running or the one-shot rule generator exited successfully.
- **Endpoint:** health/API request succeeds.
- **Provisioning:** Grafana data source, dashboard, alert, or SLO rule is loaded.
- **Ingestion:** a uniquely named synthetic log, metric, or trace reaches its backend through Vector.
- **Application:** fresh Mibba traffic produces queryable telemetry with the expected service and correlation fields.

Use unique synthetic markers and query them back. Do not declare ingestion healthy from a successful POST alone. Avoid synthetic alerts unless the user explicitly asks to exercise notification delivery; local Alertmanager intentionally routes to a null receiver.

Useful direct checks:

```sh
curl -fsS http://localhost:13400/api/health
curl -fsS http://localhost:18428/health
curl -fsS http://localhost:19428/health
curl -fsS http://localhost:20428/health
curl -fsS http://localhost:18880/health
curl -fsS http://localhost:19093/-/healthy
curl -fsS http://localhost:13400/api/datasources
curl -fsS http://localhost:18880/api/v1/rules
curl -fsS http://localhost:19093/api/v2/status
```

Query logs directly:

```sh
curl -fsS -G http://localhost:19428/select/logsql/query \
  --data-urlencode 'query=service:mibba-web level:error' \
  --data-urlencode 'limit=100'
```

Query metrics through the Prometheus-compatible API:

```sh
curl -fsS -G http://localhost:18428/api/v1/query \
  --data-urlencode 'query=up' \
  --data-urlencode 'nocache=1'
```

Use `nocache=1` when checking a freshly emitted series; VictoriaMetrics can briefly cache a prior empty instant query.

Discover traces through the Jaeger-compatible API:

```sh
curl -fsS http://localhost:20428/select/jaeger/api/services
```

## Interpret Mibba-specific telemetry

- Expected services include `mibba-web` and `mibba-worker`.
- Structured logs enter Vector at `http://localhost:18686/logs`.
- Application OTLP metrics enter Vector at `http://localhost:14318/v1/metrics`.
- Raw OTLP traces use the dedicated Vector endpoint at `http://localhost:15318/v1/traces`; the shared OTLP endpoint does not feed the trace sink.
- VictoriaLogs streams on `service`, `env`, `level`, `instanceId`, and `worktreeSlot`.
- Logs may carry `traceId` and `spanId` for correlation.
- Grafana is anonymously accessible as local Admin and provisions VictoriaMetrics, VictoriaLogs, VictoriaTraces, and Alertmanager.
- Pyrra is a one-shot rule generator, so exit code 0 is healthy. vmalert consumes its generated files.
- Alert delivery is intentionally disabled locally by the `null` receiver. Report this as configured behavior, not a broken connection.

Never print credentials or authentication secrets. Mibba's logger removes credential-shaped fields, but it does not suppress prompt, message, email, document, tool, or request/response content.

## Report inventory

For every component or connection, report: status (`works`, `partial`, `does not work`, or `not tested`), evidence, and impact. Separate backend health from telemetry availability, and call out stale Bap-named metric/rule dependencies when live Mibba series do not satisfy them.
