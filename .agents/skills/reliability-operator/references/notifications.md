# Useful human notifications

Apply external notification policy before sending. Notify for a concrete human
decision or action, significant new user impact, a meaningful recovery/regression,
a verified reliability PR merge, or a completed critical-incident postmortem.
Keep investigation mechanics, agent assignments, cause-confirmed updates, access
checks, skill edits, and ordinary retrospective lessons in operational memory.
An internal milestone alone does not justify interrupting the human.

Lead with the user consequence, outcome, or decision needed. Keep the message to
a few sentences. Include only evidence needed to make the decision; link fuller
detail rather than narrating investigation. For a question, state the exact choice,
recommendation, consequence, and what cannot proceed without the answer. Follow
existing authority rather than converting routine mechanical fixes into questions.

After a confirmed merge, send a short summary: the bug and affected user action,
what changed, why the change addresses the cause, and the PR link. State whether
production delivery/verification is pending or confirmed; merge alone never means
the incident is fixed. Group related merges when practical, keeping each PR clear.
Example: "Merged <PR link>: sandbox tasks failed because the runtime image lacked
the runner. The change protects the released snapshot pointer from stale updates.
Production rollout and recovery verification are still pending."

Record delivery identity/link under the merge, incident, or decision. Reconcile
unknown sends before retrying. Reuse a pending question without repeating unchanged
evidence, and notify again only for a material change or an agreed reminder.
Mention the verified human recipient through the configured Slack route. A daily
digest is a separate scheduled delivery; its regular summary does not authorize
routine orchestrator chatter.
