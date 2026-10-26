# Orchestrator mode

## Resume and collect

1. Read policy, current overview, pending questions, and active assignments. Run
   the preparation script with the policy's state directory and timezone; initialize
   only a new store. Inspect held journals before collecting more data.
2. Check the status of existing assignments before dispatching duplicate work.
   Read relevant incidents and decisions, including attempts from previous weeks.
3. Use the operational skills mapped in policy to query every configured source.
   Cover alerts and notification delivery, service health, metrics/SLOs,
   logs/traces, exceptions, and product friction. Follow each source's access and
   production constraints.
4. Query since the last completed collection with a small overlap, and compare
   trends over the policy's longer window. On a first run use its initial window.
   Record exact bounds, freshness, pagination/truncation, and inaccessible sources.
   Health can be healthy, unhealthy, or unknown; missing data is not recovery.
   Retry safe access checks for unavailable sources using configured procedures.
   Separate access failure from service failure, preserve TLS verification, and
   keep credentials out of records/output. When counts contradict event evidence,
   record unknown counts and investigate the discrepancy instead of claiming zero.
5. In this same collection step, assess earlier PRs using the fresh signals and
   the impact-review procedure below. Account for every change awaiting outcome
   verification, recently verified fixes within the policy's trend window, and
   older fixes implicated by today's signals. Record coverage gaps and next checks.

For a critical incident or outage, interrupt the routine review and follow
[critical-incidents.md](critical-incidents.md). Restore service first, then keep
the incident owned until the permanent correction and postmortem are complete.

## Reconcile fixes from any author

Before treating an error as active or dispatching a fix, inspect relevant recent
commits, merged/open PRs, rollout history, configuration changes, and deployed
revision, regardless of author. Include changes made by the human or another
agent outside the operator's ledger. Search the affected code path and symptom;
a matching commit title alone does not establish a correction.

Compare the candidate fix and its tests with the original symptom. Confirm whether
that exact correction reached the affected service and when. Split events before
and after deployment using occurrence timestamps and runtime/release identity,
not ingestion time or the fact an old issue remains open. Old logs, resolved
alerts, and lifetime error totals belong to history, not proof of current failure.

If deployed correction is supported by fresh scenario checks and representative
traffic without recurrence, record externally fixed/verified and remove the issue
from active work. If it is undeployed, track delivery; if evidence is insufficient,
keep verification pending. Neither case justifies a duplicate implementation or
an unchanged historical-error notification. Fresh post-fix failures justify
investigation of a residual cause or regression. Link externally authored fixes
and their evidence into the incident/merge history without claiming authorship.

## Assess the effect of earlier PRs

Read each relevant merge record and linked incident. Recover what the PR intended
to fix, its established cause, expected observable outcome, baseline, acceptance
criteria, and previous verification. Confirm the exact deployed revision and
deployment time first; distinguish an open PR, a merged-but-undeployed change, and
a change that had an opportunity to affect production.

Compare relevant pre/post-deployment alerts, metrics/SLOs, logs/traces, exceptions,
and affected user workflows. Use comparable windows and account for traffic,
sample size, workload changes, concurrent releases, and telemetry gaps. A quiet
alert or zero errors without relevant traffic is insufficient evidence. Verify
the original scenario and check for regressions in related behavior.

Record an evidence-backed outcome: deployment pending, impact unknown, intended
effect verified, partial improvement, no observed improvement, or regression.
Keep observation pending when freshness, coverage, or exposure is insufficient;
set the next check and evidence needed. Separate measured change from a causal
claim when other factors could explain it.

Reflect on whether the original diagnosis and correction held up. Append what
worked, what failed, and what the next attempt must test to the merge/incident
history. If the intended effect is absent, partial, or has regressed, reopen or
continue the finding and investigate the remaining cause before assigning a new
fix. Search previous attempts rather than repeating the same unsupported approach.

Update the overview with the outcome and owned follow-up. The review finishes
only when every due PR assessment has evidence or an explicit gap, owner, and next
verification action. Production verification is revisited when later signals
challenge it; retain earlier observations as dated history.

For a critical incident or outage, interrupt the routine review and follow
[critical-incidents.md](critical-incidents.md). Restore service first, then keep
the incident owned until the permanent correction and postmortem are complete.

## Decide and coordinate

Group related signals into a user-visible failure mode. Rank by current impact,
urgency, recurrence, and supporting evidence. Keep routine reliability improvements
separate from active incidents. Apply existing SLO/error-budget policy when present;
report missing targets instead of deriving contractual thresholds from a book.

Triage before dispatching implementation. Restore critical incidents first, then
use the selection strategy in external policy. Weigh user impact, urgency,
recurrence, confidence in the cause, and ability to verify the outcome; difficulty
alone does not determine priority. Record effort, interference, and dependencies.
Keep complex or uncertain findings owned for investigation until evidence supports
a correction. A successful run may produce fewer PRs than its limit permits.

Apply the external per-run PR limit across all implementers. Record the run identity,
PRs already handled, and reserved slots before dispatch; reconcile remote work when
resuming so interruption or context compaction cannot reset the budget. Read-only
impact assessments still cover all due PRs. Queue implementation beyond the limit
with an owner and next action, and include it in the overview and retrospective.

For a recurring symptom, compare the prior cause, fix, deployment, and verification
with current evidence. Establish whether the fix reached production, covered only
part of the problem, or a different cause produced the same symptom.

Consult the external autonomy policy. Investigate further when evidence can resolve
uncertainty. When human judgment is needed, create one pending decision and send an
actionable question through the configured notification route. Keep independent
work moving. Silence grants no approval.

For autonomous implementation, hand off one bounded finding with:

- Incident record, symptom, affected environment, and user impact.
- Evidence and time window; established facts versus hypotheses.
- Relevant previous decisions, fixes, and rejected approaches.
- Scope, permitted actions, acceptance criteria, and verification method.
- State location, assignment identity, and where the result must return.

Use the execution mechanism allowed by policy. Check existing installed tools and
recorded setup before declaring an integration unavailable; missing application
environment variables do not establish that a standalone CLI lacks credentials.
Verify notification send, read and file-sharing capabilities separately. A broken
CLI command is an investigation target, not proof the provider is unavailable.

Follow delegated work until it completes, requires a decision, or has an
established blocker. Record ownership and
status before another review can dispatch the same finding. A scheduled wakeup
resumes coordination rather than abandoning implementers still running.

## Review, merge, and follow releases

The orchestrator owns PR review and merging under the external authority policy.
Inspect the actual diff, verify the finding's red-green evidence and any staging
results, and require the project's checks on the current PR head. Resolve review
findings before merging. If the head changes, recheck the changed revision and its
required evidence. Merge only a scoped, supported correction within policy.
Before merging, record the intended production effect, baseline evidence,
observable acceptance criteria, and follow-up observation window in the incident
and merge intent. Use relevant criteria for the change rather than inventing SLOs.
An explicit human approval hold on a PR overrides standing merge authority.
Keep that PR open and wait for its approval before merging.

Record merge intent in the incident before the action. After merging, confirm the
PR's actual merged state and commit, then create its durable merge record using
the memory reference. Reconcile recorded intents with remote PR state after an
interruption so a successful merge never disappears from the ledger. Send the
brief merged-PR outcome described in [notifications.md](notifications.md), with
production verification status stated accurately.

Follow the normal production release. Link release runs and exact deployed identity,
then verify the original user-visible scenario and relevant health signals. Update
the merge record and incident when production recovery is established or the fix
fails/recurs. A merged PR is a recorded change, not proof that a bug is fixed.

## Completion gate

For actionable findings, continue working after collection. Start the permitted
implementation, follow its result, review its actual PR and checks, and follow
authorized delivery through recovery verification. Dispatch alone does not pass
this gate. A busy staging release permits local reproduction and preparation;
follow the release and resume staging when ownership clears.

Before ending, account for every selected finding with either a verified outcome
or a concrete blocker supported by failed attempts. Record the blocker, owner,
unblocking condition, next action and notification delivery. An unresolved cause
is work to investigate; complexity, a running release, a written journal, or a
missing credential in one checkout is not sufficient reason to stop. Continue
independent authorized work while any dependent action is blocked.

Apply the external PR outcome target without manufacturing changes. When no PR
is justified, explain the evidence-backed reason and preserve investigation or
verification ownership. Do not present zero implementation progress as a complete
actionable review. If a user-authorized goal is active, keep it active while any
required fix or verification remains; tool dispatch and PR creation do not fulfill
a recovery goal. Resume its recorded work on later wakeups.

## Close the review

Run the configured `retro` skill at the end of this bounded review session and
deliver its results through [session-retrospective.md](session-retrospective.md).
The coordinating chat continues across sessions; active work retains ownership.

Record cause and verification evidence for completed work. Distinguish prepared,
tested, deployed, and production-verified fixes. Confirm sufficient fresh telemetry
or relevant traffic before calling recovery; a quiet alert alone is insufficient.

Append the review journal, update incidents, merge records, and decisions, and refresh the compact
overview. Record a per-source collection cursor only after that source's collection
completes. Preserve failed sources' cursors so the next review retries their gaps.
Promote lasting findings before marking a journal disposable.

Follow [notifications.md](notifications.md) and external policy for human
notifications. Keep routine progress and retrospective mechanics in memory.
Unchanged, non-actionable reviews remain quiet; urgent alerting remains necessary.
