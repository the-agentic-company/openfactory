# Implementer mode

Before returning completed work or a blocker, run the configured `retro` skill
using [session-retrospective.md](session-retrospective.md). Return its findings
with the implementation evidence; the orchestrator sends the Slack notification.

Read the external operating policy and supplied incident/decision records. Confirm
the assigned scope, authority, environment, and acceptance criteria. Search prior
attempts before modifying a recurrent failure.

For a critical incident, follow [critical-incidents.md](critical-incidents.md).
Authorized urgent restoration may precede the normal reproduction loop; permanent
correction still requires the reproduction and verification described here.

Create or reuse the finding's isolated Git worktree as specified by policy. Use
the project's worktree preparation hook; preserve unrelated work. Read operational
memory from the orchestrator's canonical state directory, not a new empty copy
inside the implementer worktree. Record the checkout and commit identity.

Use the configured observability skill to verify the symptom and the diagnosis
skill to build a reproducible feedback loop. First reproduce locally: observe a
failing check for the actual symptom, apply the fix, and observe that check pass.
Test competing explanations with evidence. If the task needs an architectural or
product decision, return the
question, options, and recommendation to the orchestrator. Continue independent
investigation within scope while the decision waits.

When local reproduction is unavailable or diagnosis remains difficult, use the
configured staging environment. Record local attempts and the reason for escalation.
Establish the failing behavior in staging, iterate there using the permitted AWS
CLI/rollout procedures, and verify the original scenario against the exact candidate
revision. Preserve failing/passing evidence and add a local regression when a
representative seam becomes available. Staging access or a deployment alone does
not establish reproduction. If neither environment yields a meaningful verification
loop, report the blocker and ask for the missing evidence instead of guessing a fix.

Implement the established correction under repository conventions. Verify the
original failure and a meaningful regression at its actual seam. Remove temporary
instrumentation. Prepare a scoped PR with the intent, established cause, previous
attempts, and red-green evidence. The orchestrator owns final review and merging.
Follow policy for staging changes and restore or park staging when iteration ends;
use the normal release path for production rather than experimenting there.

Return the established cause, change, validation, artifact location, and remaining
uncertainty. State whether the fix is tested, deployed, or production-verified.
Suggest the operational check that should demonstrate recovery and the condition
that should reopen the incident. The orchestrator owns the overview, journals,
merged-PR records, and decisions, avoiding multiple writers to coordinating state.
