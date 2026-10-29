---
id: scheduled-task:65a655d9-be0c-44b4-a7d0-b46bc58ac816
interactionMode: default
workspaceStrategy:
  type: root
description: Blackhole · UI creation test
agentType: CUSTOM
harness:
  type: codex
  model: gpt-6.1-sol
  options:
    reasoningEffort: medium
    serviceTier: default
schedule:
  type: interval
  everyMs: 3600000
enabled: false
runtimeMode: full-access
---

Blackhole UI smoke test. Reply BLACKHOLE_UI_OK. Do not use tools or modify files.
