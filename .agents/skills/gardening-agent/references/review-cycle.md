# Review cycle and memory

## Choose a pass

Use the phase named by the caller or policy. If none is named, continue the next
phase after the latest completed run. Adapt the inspected area to urgent evidence.

| Phase       | Work                                                                    | Result                                                       |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| discover    | Inspect recent change hotspots plus one rotating area outside them.     | Candidates, concrete costs and coverage.                     |
| investigate | Trace the strongest candidates through callers, domain state and tests. | Supporting evidence, counterexamples and design constraints. |
| reconcile   | Inspect failure-handling code, changed findings and unresolved checks.  | Ranked supported findings and a daily report.                |

These are complementary passes, not three full scans or independent votes on the
same code. Track the last inspected revision and area so a large repository gets
coverage over time. Use the policy's time budget as a stopping condition; record
unfinished traces rather than claiming repository-wide review.

## Inspect a coherent revision

Record the canonical checkout revision, relevant local edits and the target revision
before reading code. Inspect source and history at that target. Do not update a dirty
checkout merely to refresh a review. Remote fetching is read-only; inspect newer
revisions with `git show` when changing the checkout would interrupt an owned server
or unfinished work. The policy chooses whether to follow main or another revision.

Use recent history to find change friction. File size, imports, branching, duplicated
code and tool output identify places to read. Confirm different reasons to change,
knowledge spread across callers, reachable state contradictions, or a concrete
failure path. Inspect infrastructure limits before calling work unbounded.

## Reconcile the dossier

One coordinating chat owns the canonical file and serializes runs. Check active
ownership before another run writes it. A different agent returns evidence to that
owner; it does not maintain a competing dossier. Record an interrupted run as
incomplete with its remaining checks before resuming.

Reuse an ID for the same smell in the same domain responsibility, including renamed
files. Keep dated observations and source revisions. Seeing unchanged code again
does not increase confidence. Correlated findings can share a root cause; rank that
cause without counting every symptom as a separate urgent problem.

States are `candidate`, `supported`, `deferred`, `dismissed`, `resolved`.
`needs-revalidation` is a verification state, not proof of resolution. Preserve the
human's rejection/defer reason and its reconsideration condition. Resolution needs
fresh inspection of the original problem at the changed revision. If source moved
or relevant code changed, revalidate it before carrying forward the old conclusion.

Save after every pass. Preserve run history and decision history; no automatic
retention deletion is authorized. Before a large dossier becomes hard to resume,
propose archival that preserves findings and decisions rather than silently pruning.
Private state is ignored by Git, so the persistent checkout is not a backup. Record
whether a backup exists and keep the backing Git repository available.

## Rank supported findings

Put demonstrated recurring bugs and change cost first, then exposure and change
frequency. Show confidence and effort separately. Use `high`, `medium`, `low`
priority with a concrete rationale rather than a fabricated numerical smell score.
Avoid style-only findings unless they cause an observed maintenance cost.

A runtime incident belongs to the Reliability Operator. Link relevant evidence and
recommend a handoff; this skill has no authority to dispatch or message another
chat unless the human authorizes it.
