---
name: gardening-agent
description: Review a codebase over repeated runs, accumulate evidence of costly code smells, and produce a ranked HTML report with a glossary. Use for a gardening review, recurring smell monitoring, or its daily report.
---

# Gardening Agent

Find the structural problems that make real changes difficult or cause recurring
bugs. Keep one accumulated dossier across runs and explain supported findings in
the project's domain language. Report and propose; refactoring is a separate task.

## Resume

Read repository instructions, personal preferences when present, and the caller's
policy. Mibba's default is `loops/gardening-operator/policy.md`. Move to its canonical
persistent checkout and read the policy and this skill there. Preserve that checkout,
its backing repository, unfinished work and runtime memory. Use
[loops-worktree-setup](../loops-worktree-setup/SKILL.md) when creating the checkout
or when environment readiness needs verification, rather than reinstalling on each run.

Read the existing `dossier.json` before inspecting code. A new store starts from
[templates/dossier.json](templates/dossier.json); create it only if absent. The
policy declares the state location, reviewed revision, priorities, cadence and
authority. Keep those choices outside the reusable skill.

## Review

Read [references/review-cycle.md](references/review-cycle.md) for phase selection,
coverage, continuity and reconciliation. Read the project's existing domain glossary
and relevant ADRs before interpreting a candidate. Mibba uses `CONTEXT.md`.

Use [references/glossary.json](references/glossary.json) for smell definitions,
evidence requirements and counterexamples. Consult
[references/reading-map.md](references/reading-map.md) for book and React lenses,
and [references/companion-skills.md](references/companion-skills.md) when assessing
module design. Read source and callers to substantiate tool signals; a size metric,
lint warning or repeated sighting does not establish a diagnosis.

Record exact revision, symbol and line anchors, the actual cost, counterevidence,
confidence and next verification. Merge repeated sightings under one stable finding
ID. Retain observations and human decisions when the conclusion changes.

## Report

Follow [references/report-format.md](references/report-format.md). The dossier is
the single canonical runtime file; [templates/finding.json](templates/finding.json)
defines a finding. Update it atomically after reconciling new observations.
Use [templates/report.html](templates/report.html) through the bundled renderer:

```sh
bun .agents/skills/gardening-agent/scripts/render-report.ts \
  loops/gardening-operator/state/dossier.json \
  loops/gardening-operator/state/report.html
```

Render after each review. During scheduled runs stay quiet when evidence is unchanged
or non-actionable; notify in the coordinating chat for a meaningful finding, worsening
condition, completed requested report, failure or required human action. Follow the
configured daily-report policy. Other messaging routes require their own authority.

Finish when the run's inspected scope, gaps, findings, decisions and next checks are
saved and the report renders. An empty or partial review is valid when labeled honestly.
Do not manufacture findings, edit application code, create fix PRs, merge, or inherit
the Reliability Operator's production permissions from this review skill.
