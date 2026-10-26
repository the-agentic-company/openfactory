# Dispatch fix chats

Use only after the user explicitly requests **fix biggest offenders** or explicitly asks to create the proposed fix chats. Present the audit and partition before dispatching; that request is sufficient authorization, so continue without another approval round.

1. Refresh stale telemetry, ownership, and deployment evidence. Recheck `list_threads` immediately before each creation, including chats created earlier in this run. Dispatch only unowned groups and confirmed regressions with sufficient evidence. Report blocked or dependent groups as pending rather than inventing filler tasks.
2. Call `list_projects` and select the returned Mibba project. Use `create_thread` with that project and the local environment, respecting the repository's shared-folder preferences. Use a worktree only when the user explicitly requests one. If independent path ownership cannot be established, create one combined chat or stage the overlapping group. Omit model and reasoning overrides unless the user requests them.
3. Title each chat `[SLO <group-key>] <user-visible symptom>`. Give it the self-contained assignment below, populated with actual evidence. Create one chat per selected independent group, not per dashboard panel, alert, trace, or SLO.
4. Record each returned identity before the next dispatch. If creation returns ambiguously, inspect the chat list before retrying. A queued `clientThreadId` is not a ready `threadId`. Once ready, use one bounded `wait_threads` snapshot to confirm dispatch progress; hand ongoing implementation to those chats without repeated polling.

## Assignment content

Write a human-readable prompt containing:

- **Outcome:** the affected user behavior to restore, environment, stable group key, and SLOs affected.
- **Evidence:** absolute audit and comparison windows, exact queries/selectors, bad/total counts and trend, redacted log/trace references, latest occurrence, and telemetry gaps. Preserve links to prior fixes and their deployment evidence.
- **Diagnosis:** observed facts, root-cause hypothesis, proposed fix, and alternatives still to rule out. Reproduce and verify the hypothesis before editing; conclude with evidence if it is already fixed or misattributed.
- **Ownership:** exact allowed paths or bounded subsystem, other active groups and their owned paths, dependencies, and shared runtime constraints. Escalate overlap to the user before changing another group's scope.
- **Workflow:** read repository instructions and preferences; use observability for operational evidence and diagnose for reproduction. Implement the smallest root-cause fix, verify the affected behavior, follow the repository's jj workflow for task-only commits, and open and attach one draft PR when warranted. Preserve unrelated work.
- **Acceptance:** a concrete failing scenario and expected corrected behavior, focused checks, and the production query that will establish recovery after deployment. Preserve SLO targets and eligibility; an instrumentation correction needs separate evidence that it reflects actual user outcomes. A passing test or merged PR does not establish production recovery.
- **Authority:** read-only production investigation and local code/test changes, with commit and draft PR creation. Production deployment, merge, repair, alert injection, and outbound messages need separate user authorization. Follow repository repair safeguards if a data repair is proposed. Report findings and blockers in this chat; do not message the coordinating chat without explicit user authorization.

## Dispatch result

Report created chat titles and their identities/links, findings already owned or fixed, staged dependencies, and failed or ambiguous creations. Emit one `::created-thread{threadId="..."}` directive per ready chat, or `::created-thread{clientThreadId="..."}` for queued setup. Claim only creation and observed startup status; the child chats own fix completion.
