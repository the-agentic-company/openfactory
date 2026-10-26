# Daily digest mode

Produce a global reliability picture using the external policy, canonical memory,
and fresh read-only evidence. This mode reports and recommends; the orchestrator
retains implementation ownership. Preserve active assignments and approval holds.

## Gather and compare

Resume the overview, incidents, decisions, merge records, previous digests, and
explicit daily/weekly priorities. Check evidence timestamps. Use the configured
observability, exception, and product-friction procedures to refresh missing or
stale evidence safely. Record unavailable sources and exact comparison windows;
partial coverage must remain visible.

Compare the last 24 hours with the preceding 24 hours and the seven-day trend.
Account for traffic, sample size, workload, deployments, and telemetry gaps. Use
failure rates when denominators are available; counts alone do not prove better
reliability. Label trends improving, worsening, stable, or unknown with supporting
measurements. Older observations are historical context, not current health.

Reconcile relevant fixes from any author and actual deployment using the
orchestrator's fix-reconciliation and PR-impact procedures. Distinguish old
pre-fix events, fresh recurrence, undeployed changes, and pending verification.
Include only incidents still supported as active or explicitly awaiting evidence.

## Write the digest

Lead with overall health and whether it is improving. Cover:

- Current healthy/degraded/unknown services and material user impact.
- Error, latency, SLO, backlog, and blocked-user-action trends where available.
- Yesterday's completed work and deployed fixes with demonstrated effect.
- Active work, recurring problems, and fixes still awaiting impact verification.
- Progress against recorded daily and weekly priorities, with owned next actions.
- Decisions or actions needed from the human and consequential coverage gaps.

If priorities are not defined, report observed progress and state that goals are
unconfigured. Avoid invented targets, agent coordination narration, and internal
process lessons. Link evidence and PRs rather than reproducing raw customer logs.

Save `digests/YYYY-MM-DD.md` in the canonical state directory using the policy's
timezone. Include evidence windows, freshness, uncertainty, and durable links.
Preserve these records beyond journal cleanup. Safely create the private directory
when absent; reject symlinked destinations and preserve existing records. Append
dated corrections or manual reruns rather than silently rewriting past conclusions.
Render a self-contained HTML report from this Markdown when policy calls for it;
keep the HTML beside the source so both represent the same findings.

## Deliver once

Follow the configured daily-digest route. Send a concise summary with the overall
direction, key outcomes, needed decisions, and an accessible report if available.
Mention the verified human identity. The scheduled digest is an intentional daily
delivery even when no issue requires action; say that no material change was found
when supported by fresh evidence.

Track per-date delivery and message/file identities in the digest. Reconcile
unknown sends before retrying and avoid a second scheduled digest for the same
local date. If Slack or HTML upload is unavailable, preserve the report and pending
delivery, and report the gap in the coordinating chat. Do not claim delivery or
recovery without evidence. Leave fix dispatch and PR merging to orchestrator mode.
