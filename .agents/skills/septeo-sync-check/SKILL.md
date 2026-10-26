---
name: septeo-sync-check
description: Checks whether a Mibba Septeo document sync or backfill is genuinely draining, verifies the desktop AI dependency over SSH, and estimates synced and remaining files from production state. Use when asked about Septeo, C&C Notaires, a 90-day sync, queue drainage, backfill progress, indexed-file counts, or blockers on desktop-server.
---

# Septeo Sync Check

## Quick start

Read `.agents/skills/observability/SKILL.md`, `docs/observability.md`, and
`docs/prd/cc-notaires-document-evidence-queue-drain.md`. Keep every production
operation read-only. Never print credentials, document titles, client data, or
raw document identifiers.

Check all three layers; none is authoritative by itself:

1. `ssh desktop-server` for the AI parsing/embedding dependency.
2. BullMQ for the small dispatched batch.
3. PostgreSQL for durable backlog, backfill progress, and indexed-file coverage.

## Desktop dependency

Run bounded, read-only checks:

```sh
ssh desktop-server 'systemctl --user is-active mibba-ai; systemctl --user show mibba-ai -p NRestarts -p ActiveEnterTimestamp; journalctl --user -u mibba-ai --since "30 minutes ago" --no-pager -n 120'
```

Report restart loops and the newest actionable error. Do not restart the service
or edit its unit unless the user explicitly asks.

## Production state

Use `AWS_PROFILE=mibba-production` and `AWS_REGION=eu-west-3`. Discover the live
worker service and task; never reuse a task ID from an earlier run. Prefer the
private production database route when healthy. Otherwise use `aws ecs
execute-command` on the running worker and Bun's `SQL` client with its existing
`DATABASE_URL`. Execute only `SELECT` statements and dynamically resolve the
workspace by organization name/slug; never hardcode a workspace or run ID.

Collect one JSON snapshot containing:

- Septeo connection status, phase, last sync, last error, and stale lease.
- Latest `document_evidence_backfill_run`: status, cutoff, total/completed,
  heartbeat, restart count, pages, chunks, and processing time.
- Latest-run item counts by status and failure category, including falsely stuck
  `processing` rows and their oldest update time.
- `document_evidence_ingestion_request` counts split into `historical:%` and live
  signals, grouped by status, plus completions over 15 minutes, 1 hour, and 24 hours.
- Active Septeo documents from `legal_record_document` and distinct documents with
  an active, completed `document_content_version`.

Define synced files as distinct active source documents with an active completed
content version. Also report the narrower latest-run `completed_documents` count;
label these separately because they answer different questions.

## Prove drainage

Take three PostgreSQL snapshots at least five minutes apart. Drainage requires:

- durable historical pending decreases on every sample;
- the latest historical completion timestamp advances;
- live completions continue; and
- the Septeo connection is current and not stale.

BullMQ waiting/active counts are supporting evidence only. An empty Redis queue
can coexist with a large durable backlog because dispatch is bounded. If time does
not permit three samples, say that drainage is not yet proven and report the
instantaneous state.

Estimate throughput from the delta in completed historical items between samples.
Give `remaining / observed_rate` only when the rate is positive, state the sample
window, and present it as a range when failures, retries, or live work compete.

## Diagnose blockers

Correlate database state with bounded worker CloudWatch logs and production
Victoria metrics/logs. Check provider/account/dependency circuits, deferred and
failed ingestion outcomes, parser/AI errors, worker health, and schema errors.
Separate facts from inference. A run marked `running` with a stale heartbeat and
no runner is stranded, not healthy.

## Recommend action

Every report that finds `not draining` or a material blocker must put a prominent
`Recommended action` section immediately after the opening verdict and before the
detailed evidence. Do not leave the user to infer the fix from a list of symptoms.

Use this shape:

```markdown
## Recommended action

**Blocking: <the highest-leverage blocking condition>.**

**Fix:** <the concrete change or operational action that should be taken>.

**Verify:** <the observable exit criteria that prove the blocker is cleared>.
```

- Recommend one primary action when one blocker dominates. If independent
  blockers must be cleared in sequence, number the actions in dependency order.
- Name the failing surface and, when repository evidence supports it, the likely
  code or configuration seam. Distinguish a confirmed cause from an inference.
- Make the fix executable: say what to change, where, and what successful rollout
  evidence must look like. `Investigate`, `monitor`, or `restart and see` alone
  are not recommendations.
- Separate an immediate mitigation from the durable fix when they differ. Never
  present a restart as a durable fix for a repeatable code or configuration fault.
- Keep production mutations outside this read-only check. If the recommendation
  requires a deployment, restart, repair, or data change, state that it requires
  explicit authorization; do not perform it as part of this skill.
- When evidence is insufficient to prescribe a safe fix, recommend the narrowest
  diagnostic needed to decide, and state exactly what result would select the fix.

## Report

Lead with `draining`, `not draining`, or `not proven`. When blocked, follow that
verdict with the highlighted `Recommended action` section above. Then include
observation times, synced/total/remaining files and percentage, durable historical
and live backlog, latest-run progress, observed rate and ETA, desktop AI health,
Septeo connection health, top blockers, and unavailable evidence. State that no
production state was changed.

Example: `Not draining — 29,166/67,654 latest-run files complete (43.1%), heartbeat
stale; Redis is moving but does not represent the durable backlog.`
