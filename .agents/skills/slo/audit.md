# Audit and triage

## Establish evidence

Read `docs/observability.md` through the observability skill. Discover current SLO definitions in `observability/pyrra/slos/`, dashboard queries, deployed rules, and live series. Use deployed targets, windows, and selectors; report differences from source. A legacy metric prefix alone does not prove a metric is obsolete.

Check access, backend health, ingestion freshness, and relevant service deployment state before interpreting the numbers. When access fails, report the precise gap and stop dependent analysis. Missing series, zero eligible traffic, and confirmed success are separate states.

For every SLO with eligible traffic, collect total and bad events, failure fraction, target, budget consumption/burn, and change from the comparison window. Preserve the authoritative eligibility rules. If production counters mix synthetic and real traffic, report the configured SLO and a separate real-traffic view where labels permit it. Never silently change its denominator.

Use counter increases rather than raw lifetime totals. An absent bad series is zero only when its matching total establishes observed traffic. Exclude `global` from sums across journeys: the same terminal outcome may also appear in a specific journey. Do not add distinct SLI denominators as if they represented unique users or incidents.

Correlate leading failures with bounded log/trace samples and the emitting code. Identify affected user workflows, failure signatures, latest occurrence, and plausible ownership. Logs and traces may explain a counter; sampled examples alone do not establish population frequency. Distinguish measured attribution from hypotheses and state unexplained remainder or sampling limits.

Done when every discovered SLO has evidence or an explicit coverage gap, and each candidate has a reproducible query, absolute time bounds, and enough diagnostic evidence to scope investigation.

## Check whether work already handles it

Give each candidate a stable key: environment + affected operation + normalized failure signature. Keep request, user, and case identifiers out of the key and chat title.

Inspect existing Codex chats with `list_threads`; read plausible matches with `read_thread`, using returned titles verbatim. Inspect open and recently merged PRs, relevant commits, and existing reliability incident/assignment records when available. Search by signature, affected operation, and linked issue IDs; a title match alone does not establish ownership.

Assign one disposition with evidence:

| Disposition | Evidence and next action |
| --- | --- |
| Unowned | Current failures, no matching active owner or fix found; eligible. |
| In progress | Matching active chat or open PR; link it and exclude duplicate dispatch. |
| Awaiting deployment | Matching merged fix has not reached production; report release state. |
| Verification pending | Fix deployed, but insufficient fresh eligible traffic or attribution; report uncertainty. |
| Verified fixed | Relevant production revision deployed and fresh eligible observations support recovery; exclude. |
| Regression | Same signature recurs after deployment; eligible, with prior work linked. |
| Unknown | Ownership, rollout, or telemetry gap prevents a decision; explain what would resolve it. |

Historical bad events inside a rolling window do not prove a fix failed. Compare occurrences with actual deployment time. If work is already owned, report the existing chat; messaging it requires the user's explicit authorization. Partial search coverage is a gap, not proof that no owner exists.

## Rank and partition

Rank unresolved findings by user harm and breadth, contribution to bad outcomes/budget burn, worsening trend, recency, then confidence. Show counts and denominators alongside percentages; identify serious low-volume failures even when their budget contribution is small. Keep missing telemetry as a separate reliability finding rather than a successful SLO.

Propose at most five high-value fix groups, fewer when evidence supports fewer. One group represents one coherent root cause and acceptance condition:

- Combine failures across SLOs when evidence points to the same cause and code owner.
- Separate independent causes within one SLO when each can be reproduced and fixed independently.
- Keep uncertain causes in a bounded investigation group; label the proposed fix as a hypothesis.
- Map likely edited paths, shared dependencies, schema/config changes, and runtime needs. Disjoint scopes can run together. Group overlapping work into one chat or stage dependent chats after the prerequisite lands; do not dispatch concurrent writers to shared files.

Done when every candidate has a disposition and each selected group has impact evidence, a proposed fix or investigation, path ownership, dependencies, and a behavior-based verification plan.

## Deliver the audit

Report the environment, windows, coverage gaps, and a ranked table: group/key, affected SLOs, bad/total and trend, user impact, status/prior work, proposed fix, confidence. Include query or dashboard links and redacted diagnostic references close to each finding.

Explain the proposed chat split: which failures share a cause, which fixes are independent, and which must wait. Distinguish implementation completion from production recovery. End audit mode here.
