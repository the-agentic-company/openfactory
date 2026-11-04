# OpenFactory project instructions

Use pnpm for dependencies and scripts, and Vite+ (`pnpm exec vp`) for tooling.

Use `pnpm dev` for development. Its startup script manages the detached `openfactory-dev` tmux session, starts Electron and both web servers, and verifies readiness. Run it again to reuse the servers and reopen Electron. Leave the session running after the task.

Before using an imported skill from `.agents/skills`, read [.agents/README.md](.agents/README.md) for its source-project prerequisites and command mapping.

Use Jujutsu (`jj`) for commits and publishing. Package only the paths owned by the current task; preserve other work in this shared checkout.
