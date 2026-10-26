# Operational memory

Use the external state directory from policy. The state marker identifies a store
owned by this skill; it is not a service-health signal. The orchestrator is its
writer. Implementers return evidence and record changes through the orchestrator.
Keep source credentials and raw customer content out of records.

## Record responsibilities

| Record                               | Contents                                                                                                                                                                                    | Update method                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `overview.md`                        | Current health, source coverage and cursors, active incidents, priorities, assignments, pending questions, next verification                                                                | Replace the current summary; link durable records                             |
| `journal/YYYY-MM-DD.md`              | Each review's local time, query bounds, observations, evidence links, work dispatched, and unresolved coverage                                                                              | Append a review section                                                       |
| `incidents/<slug>.md`                | Stable identity, symptoms, impact, evidence, hypotheses, prior attempts, deployment status, recovery proof, recurrence                                                                      | Append dated findings and transitions                                         |
| `decisions/<slug>.md`                | Question, options, recommendation, pending/answered state, notified message identity/link, human choice and rationale, reconsideration conditions                                           | Append notifications and decisions                                            |
| `merges/<repository>-pr-<number>.md` | PR URL/title, merged head and commit, merge time, intended correction, linked incident, established cause, red-green/review/CI/staging evidence, release/deployed identity, recovery status | One durable record per verified merge; append release and recurrence findings |

Use identifiers and links that allow a later review to retrieve the original
evidence. Search incidents and decisions before assigning a recurring symptom.
Preserve earlier attempts; correct an inference with a new dated entry.

## Merged-PR ledger

Keep HTML postmortems at `postmortems/<incident>.html`. Link them from the incident
and overview; preserve them beyond journal retention. Record Slack delivery status
and the message/file link in the incident.

The orchestrator records every PR it merges, even if production promotion later
fails. Derive the identity and timestamps from the remote merged PR, not the merge
command's exit status alone. Use statuses that distinguish merged, released,
production-verified, failed, and reopened. Link the incident and its prior attempts
so the next review can establish what the change intended to fix and whether the
underlying bug persisted. Keep the merge record through journal cleanup. Include relevant externally authored
fixes discovered during reconciliation, recording their actual author/source.
Track merged-PR notification state and message identity/link separately from
deployment and recovery, so interruption cannot cause duplicate pings.

The current overview links active releases and verification still due. Daily review
notes may link to the ledger but never replace it. Reconcile pending merge intents
with remote state when resuming an interrupted review.

Each merge record also retains the intended observable effect, baseline and query
windows, acceptance criteria, deployed revision/time, and dated impact assessments.
Record relevant traffic/exposure, pre/post measurements, regression evidence,
uncertainty, lessons about the diagnosis, and the owner/next check for pending work.
Append assessments during the regular alerts-and-metrics review; preserve earlier
conclusions when later evidence changes the outcome. Link due assessments and
reopened findings from the overview.

## Retention

New journals begin with this frontmatter:

```yaml
---
retention: pending
---
```

After every review, move lasting evidence, active assignments, pending questions,
and decisions into the overview and durable records. Add links or promotion notes
in the journal. Only then change the frontmatter to `retention: disposable`.
Before appending to an existing day's disposable journal, mark it pending again.

Preparation keeps fourteen calendar dates including today, interpreted in the
policy's timezone. It removes only older, explicitly disposable, dated Markdown
journals. Old pending journals are held for promotion. Incidents, decisions, merges, postmortems, the
overview, policy, and unrelated files are never retention targets. A dry run is
available; normal pre-review preparation applies this authorized journal cleanup.

The cleanup lock lasts only for preparation. It does not stop an agent or prove
that no review is running. The orchestrator checks existing review/assignment
ownership separately. A leftover preparation lock is reported; it is not stolen.

## Persistence

Keep daily digests in `digests/YYYY-MM-DD.md` with rendered HTML beside the source
when configured. Preserve these records beyond journal retention, including
comparison windows, uncertainty, evidence links, and notification delivery state.

Policy is versioned separately from runtime state. State may be private and
gitignored; it remains on disk but Git does not back it up or transfer it. Configure
a backup/shared store before moving coordination between machines. Use the same
state location across reviews. Promote reusable engineering decisions to ordinary
project documentation when they are appropriate for the team.
