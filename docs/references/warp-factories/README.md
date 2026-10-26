# Warp Factories UI reference

36 selected screens and UI states from [Introducing Warp Factories](https://www.youtube.com/watch?v=0WBk4ai8y1A), extracted on 2026-10-28. The video is 8:56 long. The [Warp Factories documentation](https://docs.warp.dev/factories) embeds this same video and supplies context for the product terminology.

Open [index.html](index.html) for the searchable gallery. Filter by Factory, Integration, GitHub, or Desktop; open each image for its original 3840 × 2160 frame. Every entry links to its source timestamp.

## Folder contents

- `screenshots/`: 36 PNGs at the video's original 4K resolution.
- `thumbnails/`: smaller JPEGs used by the gallery.
- `contact-sheets/`: three labeled overviews of the selected frames.
- `manifest.json`: screen names, categories, timestamps, source links, and observations.
- `extract.py`: repeatable extraction from a local copy of the source video using ffmpeg.
- `index.html`: standalone gallery; no server, dependencies, or build required.

The frames are unchanged captures, including the original presenter overlay, browser chrome, zooms, and occasional partial views. Several files show different states of the same page rather than different routes. Slack, Linear, GitHub, and the Warp desktop app are labeled separately from the factory web UI. These are third-party reference images, not OpenFactory assets or screenshots of our implementation.

## What is visible

The selection covers agent roles, code-host onboarding, secret editing, factory and agent definitions, issue intake, Slack requests and approvals, specs, desktop conversations, pull requests, computer-use recordings, activity, runs, search, run metadata, agent configuration, automations, scorer configuration and results, self-improvement diffs, and cost/output dashboards.

The later sections name Benchmarks, Settings, Code, Runners, Environments, and MCPs in navigation, but do not clearly demonstrate their full pages. No screenshots have been invented for those routes. A screenshot also cannot establish that a particular control works or reveal behavior hidden behind it.

## Ideas to bring into OpenFactory

These are recommendations based on the captured UI, not claims about features we already have.

1. **Give each project a factory workspace.** Keep the project visible while moving between Overview, Work, Agents, Runs, and Automations. The persistent sidebar in frames 05, 20, 21, and 26 provides a useful reference.
2. **Separate an agent from its triggers.** Keep role, model, instructions, tools, and resources on the agent page (05, 25). List schedules and webhooks under Automations (26). An agent can then have several triggers without becoming several unrelated cards.
3. **Track a request across multiple runs.** Activity (20) groups work by stage, while Runs (21–23) exposes individual executions. OpenFactory currently centers scheduled agents and their conversations; a work-item layer would make multi-agent experiments easier to follow.
4. **Make runs inspectable.** Combine the conversation with status, source, timing, tools, model, artifacts, and actual cost when the backend supplies them (22–24). Keep scheduler dispatch success separate from completed execution.
5. **Make approval states explicit.** The Slack and GitHub handoffs (12, 15, 18) show where a person reviews a spec or change. We can express those checkpoints inside OpenFactory while linking back to the source conversation or PR.
6. **Add evaluation after run history is solid.** Scorer configuration, classifications, and result explanations (27–30, 36) give experiments a visible outcome. Keep the rubric and the evidence beside each result.
7. **Add honest operational summaries.** The dashboard (33–35) combines a date range, cost breakdown, and output volume. Only show metrics T3 can actually supply; unavailable costs should stay unavailable rather than being inferred from dispatch counts.

For the next UI iteration, prioritize the project workspace, agent-versus-automation separation, and a useful run inspector. Evaluation and cost reporting can follow when their data is available.

## Re-extract the frames

Download the linked video locally with your preferred tool, then run:

```sh
python3 docs/references/warp-factories/extract.py /absolute/path/to/video.mp4
```

Python 3 and ffmpeg are required. The manifest owns the curated timestamps. The original full video is not included in this folder. The selection was reviewed using samples across the entire video and closer samples around the dense settings and evaluation sections; it is a reference inventory, not a claim that every transient animation frame was captured.

The video's publishing date is 2026-08-18. The documentation was viewed on 2026-10-28, so the current documentation may describe behavior that differs from this recorded UI.
