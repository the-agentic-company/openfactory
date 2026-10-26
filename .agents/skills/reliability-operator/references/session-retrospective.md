# End-of-session retrospective

At the end of each bounded review or implementation session, read and run the
`retro` skill configured in external policy. A session ends when the review closes
or an implementer returns completed work or an explicit blocker; the persistent
coordinating chat need not end. Preserve ownership of work still running.

Use that session's actual transcript, actions, evidence, and failed attempts.
Follow the retro skill's instructions to identify improvements to navigation,
checks, agent guidance, tool use, and information access. Rank findings by severity.
Distinguish established findings from hypotheses and give a concrete next action.
Report when no supported improvement was found instead of inventing findings.

Append the results to the session journal and promote lasting lessons, pending
decisions, and owned follow-up into durable records before journal cleanup.
An implementer returns its retrospective with its result to the orchestrator.
The orchestrator owns Slack delivery for both modes and avoids duplicate sends.

Apply [notifications.md](notifications.md) before sending retrospective results.
Keep internal process lessons and no-findings results in memory. Notify only when
a finding has a concrete human decision, significant impact, or other material
value under policy; combine it with a relevant outcome message when appropriate.
Mention the verified recipient and include the consequence and proposed action,
with accessible evidence links. Redact credentials and customer content.

Record delivery state, message identity/link, and the session identity. Reconcile
an unknown outcome before retrying; reuse an existing delivery for that session.
If retro access or a required Slack delivery is unavailable, retain a pending action in the
overview and report the gap in the coordinating chat. Do not claim the skill ran
or the recipient was notified without evidence. This retrospective supplements
the critical-incident HTML postmortem and the regular PR-impact assessment.
