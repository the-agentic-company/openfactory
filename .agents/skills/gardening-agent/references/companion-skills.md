# Companion skills

Use Matt Pocock's shared design vocabulary when assessing architecture: module,
interface, implementation, depth, seam, adapter, leverage and locality.

- [codebase-design upstream](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md)
  defines the vocabulary and deletion test. Resolve its installed `SKILL.md` in the
  current skill catalog; read it for architecture findings.
- [improve-codebase-architecture upstream](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md)
  supplies hotspot and deepening questions. Mibba has a customized copy at
  [../improve-codebase-architecture/SKILL.md](../../improve-codebase-architecture/SKILL.md).
  Use it as reference for candidates, and as an interactive follow-up after selection.
- Mibba's [React Doctor](../../react-doctor/SKILL.md) and installed Fallow skill can
  provide static candidate evidence. Inspect their current behavior before running
  them; use read-only modes and record missing or stale output.

The upstream interactive architecture workflow can spawn agents and edit domain
documentation. Gardening's scheduled review reads its criteria; it does not invoke
those side effects. Repository delegation rules and the caller's review authority
remain controlling. Installed skills may differ from upstream; record the version
or local path actually consulted and preserve customized repository skills.
