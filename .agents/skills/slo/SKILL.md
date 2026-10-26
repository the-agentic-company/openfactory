---
name: slo
description: Audit Mibba's biggest unresolved SLO offenders and propose fixes, or dispatch scoped Codex fix chats. Use for SLO biggest offenders or fix biggest offenders.
---

# SLO

## Choose the mode

- With no mode or actionable request, reply only: `Run SLO biggest offenders or SLO fix biggest offenders.` Then stop; make no telemetry queries or chats.
- **biggest offenders**: read [audit.md](audit.md), audit current production evidence, and propose fixes. Finish with the ranked findings and proposed chat boundaries. This mode is read-only.
- **fix biggest offenders**: perform or refresh the same audit, then read [dispatch.md](dispatch.md) and create fix chats for eligible findings. An explicit request to run this mode authorizes those new chats. Audit mode alone does not.

Respect a supplied environment, window, or subset. Otherwise inspect production over the last 24 hours, compare with the preceding 24 hours, and use the configured SLO window for budget context. Report absolute bounds and timezone.

Use the repository's [observability skill](../observability/SKILL.md) for access, health checks, queries, and evidence handling. Follow its production investigation branch; start local services only when a local reproduction needs them. This skill coordinates triage and dispatch; implementation belongs in the fix chats.
