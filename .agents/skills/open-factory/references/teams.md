# Teams

Use a team when agents need shared guidance and a reporting structure. Create its agents first. A team organizes existing agents; its reporting lines do not automatically delegate work or grant permissions.

The factory's **Teams** page can create a team from existing agents. **Factory definition** shows their actual saved file paths. Use those paths in `team.yaml`; agent IDs and directory names are different identifiers.

```text
factory/teams/reliability/
  team.yaml
  instructions.md
```

Example `team.yaml` (replace agent paths with this factory's saved paths):

```yaml
schemaVersion: v1alpha1
name: Reliability
description: Investigate incidents and summarize operational health.
instructions: ./instructions.md
lead: operator
members:
  operator:
    agent: agents/operator/agent.md
  digest:
    agent: agents/digest/agent.md
    reportsTo: operator
```

Agent paths resolve from the factory definition root, not the team folder. Each member references a distinct agent bound to this factory. Member keys such as `operator` are team-local IDs. Exactly one lead omits `reportsTo`; every other reporting chain must reach that lead without cycles. Optional `instructions` resolves beside `team.yaml` and currently uses `./instructions.md`.

Put shared objectives, repository context, collaboration boundaries, and handoff expectations in `instructions.md`. Keep each member's provider settings, permissions, prompt, and schedule on its agent.

From the OpenFactory checkout, apply and inspect the team:

```sh
pnpm -C "$factory_repo" openfactory team-apply '<project-id>' /absolute/path/to/repository/factory/teams/reliability/team.yaml
pnpm -C "$factory_repo" openfactory teams '<project-id>'
```

`team-apply` copies the team files into the repository’s `factory/teams/` directory and resolves references against `factory/agents/`. It returns the repository location and content revision. If starting with CLI-created agents, inspect that factory's **Factory definition** for generated paths before authoring references. Reapplying identical files keeps the revision. Saving membership or guidance does not start agents or change schedules.

When execution is requested, address a member using the saved team path and local member ID:

```sh
pnpm -C "$factory_repo" openfactory team-run '<project-id>' teams/reliability/team.yaml digest 'Summarize the incident.'
```

Manual runs, timers, webhooks, and follow-ups receive shared team guidance when queued. Already queued turns retain the captured guidance. Inspect the returned session as described in the main skill before reporting the work complete.
