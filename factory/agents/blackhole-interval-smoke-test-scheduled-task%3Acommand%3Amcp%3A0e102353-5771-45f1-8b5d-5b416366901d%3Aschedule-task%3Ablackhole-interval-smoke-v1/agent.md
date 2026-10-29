---
id: scheduled-task:command:mcp:0e102353-5771-45f1-8b5d-5b416366901d:schedule-task:blackhole-interval-smoke-v1
interactionMode: default
workspaceStrategy:
  type: root
description: Blackhole · interval smoke test
agentType: CUSTOM
harness:
  type: codex
  model: gpt-6.1-sol
  options:
    reasoningEffort: medium
    serviceTier: default
schedule:
  type: interval
  everyMs: 86400000
enabled: true
runtimeMode: full-access
---

Blackhole scheduler smoke test. Reply exactly: BLACKHOLE_INTERVAL_OK. Do not use tools or change files.
