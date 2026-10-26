---
name: product-friction
description: Inspect Mibba's expected product friction in Grafana, or connect another user-visible blocked action to the shared friction reporting path. Use for unavailable previews, empty results, unsupported capabilities, and MCP semantic friction; use Sentry for unexpected exceptions.
---

# Product friction

Product friction is an expected, user-visible outcome that prevents or degrades a task even though the application has not crashed. It is an **occurrence count**, not a failure percentage. Count one meaningful failed attempt, not each React render, request retry, or background refresh.

## Where it goes

- `reportProductFriction` in `packages/core/src/server/product-friction.ts` is the sole server-side ingestion interface. It writes `mibba_product_friction_total` to VictoriaMetrics and `event:product.friction.reported` to VictoriaLogs.
- Grafana provisions `observability/grafana/dashboards/mibba-product-friction.json`. Its weekly bars and type/location table read VictoriaMetrics; its examples panel reads VictoriaLogs.
- Metric labels are only `kind`, `surface`, and `reason`, plus runtime labels supplied by observability. Case, document, user, workspace, generation, and report identifiers belong only in structured logs. Never place names, document contents, URLs, IDs, free text, or arbitrary user input in metric labels.
- Sentry remains the path for unexpected exceptions. A visible fallback is reported as friction even when no exception or HTTP 500 occurs. Traces may help investigate one occurrence but are not the counting source.

Open production Grafana at `https://grafana.ops.prod.mibba.co` through the tailnet, or local Grafana at `http://localhost:13400` when the local observability stack is running. Search for **Mibba Product Friction**. For production access and health checks, follow `docs/observability.md` and the `observability` skill. If Tailscale is unavailable, do not interpret an unreachable private Grafana URL as a missing signal.

## Inspect a pattern

1. Open **Mibba Product Friction** in Grafana, select the environment and time range, then read the weekly count and the table grouped by `kind`, `surface`, and `reason`.
2. Open the logs panel for examples. Filter `event:product.friction.reported` by the bounded category, then inspect authorized identifiers and trace IDs in log details. Handle dossier and document IDs as customer data.
3. Compare the timestamp with a deployment and, when relevant, the document's actual metadata. Do not conclude that the problem is fixed merely because no new event appears; the action may not have been attempted.

Useful PromQL for a rolling seven days:

```promql
sum by (kind, surface, reason) (
  increase(mibba_product_friction_total{deployment_environment="production"}[7d])
)
```

## Connect another product flow

1. Define the user intent and terminal blocked outcome. Report from the outcome, after required metadata has resolved, once per attempt. Do not emit from a fallback render that can repeat.
2. Extend the typed `kind`/`surface`/`reason` taxonomy in `packages/core/src/server/product-friction.ts`. Keep every new metric label value from a small fixed vocabulary; put diagnostic IDs in log fields.
3. For browser flows, add an authenticated server entry point that validates the referenced resource belongs to the active workspace, then calls `reportProductFriction`. Do not trust browser-supplied workspace or user IDs. `apps/web/src/server/orpc/routers/product-friction.ts` is the document-preview example.
4. For server and MCP flows, call `reportProductFriction` directly with trusted principal context. `report_semantic_friction` in `apps/mcp/src/server.ts` is the MCP example.
5. Check the Grafana dashboard after real traffic has occurred. Count signals in VictoriaMetrics and inspect examples in VictoriaLogs. Update dashboard titles or taxonomy descriptions when a new kind would otherwise be hard to interpret.

The document-preview example covers unknown type, unsupported format, missing preview URL, and failed PDF, image, or Office loads. It marks `controls` only when the source was opened from Controls; other document openings use `documents`.
