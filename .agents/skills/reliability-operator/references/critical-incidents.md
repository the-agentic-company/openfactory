# Critical incidents and outages

The orchestrator owns restoration, permanent correction, and the postmortem.
Restored service is a mitigated incident; it does not finish the work.

## Restore service

Capture the affected user actions, onset, deployed revision, and enough evidence
to choose a mitigation without delaying recovery. Use the least disruptive,
documented restoration allowed by external policy, such as rollback to a known
healthy release. Confirm the exact environment, target, rollback safeguards, and
recovery checks before acting. Preserve evidence when practical.

Do not require a complete local reproduction or root-cause investigation before
an authorized urgent restoration. Experimental fixes still belong in local or
staging environments. If restoration exceeds authority or needs human judgment,
record the blocker and immediately contact the configured human through Slack.

Verify the affected user workflow and fresh health signals after restoration.
Record the mitigation, deployed identity, evidence, and remaining limitations.
Mark the incident mitigated and continue its permanent correction.

## Correct the underlying problem

Search prior incidents, fixes, and decisions. Use an isolated worktree and attempt
local red-green reproduction. If reproduction fails locally or diagnosis remains
difficult, reproduce and iterate in staging under the deployment policy. Follow
the implementer reference for evidence, scoped changes, and regression checks.

A verified permanent rollback or configuration correction can be the long-term
fix when it addresses the cause; do not add unnecessary code changes. Document
why recurrence is prevented and verify that claim.

Review the correction and its current-head checks, respect explicit PR approval
holds, and follow normal production delivery. Verify the original scenario in
production. Keep the incident open with an owner and next action if access,
approval, or diagnosis blocks the permanent fix. Resume it on subsequent reviews.
Never stop after restoring service.

## Publish the HTML postmortem

Write a self-contained HTML report at `postmortems/<incident>.html` in the external
state directory. Keep this report through journal cleanup. Include:

- User impact, affected services, severity, and incident window.
- A timeline with timestamps and evidence links.
- The restoration action and its limitations.
- Root cause and contributing conditions, separating facts from unknowns.
- Permanent correction, PRs, deployed revision, and regression/recovery evidence.
- What helped recovery, what delayed it, and preventive actions with owners/status.

An interim report may document mitigation, but label the permanent correction
unfinished. Finalize the report after production verification of the long-term fix.
Keep interim reports in memory unless significant user impact or a required human
decision makes interim delivery useful under [notifications.md](notifications.md).

After finalizing the permanent-fix postmortem, ping the configured human on Slack
with the HTML report using the established
CLI/bot and approved file upload or sharing route. A local file path is not a
Slack-accessible report. Confirm delivery and record the message/file link in the
incident. If delivery fails or its outcome is unknown, keep delivery pending and
reconcile before retrying. Report missing notification access in the coordinating
chat rather than claiming delivery.

Close the critical incident only after permanent correction is verified and the
HTML postmortem is delivered. Keep outstanding preventive actions owned and
visible in the overview.
