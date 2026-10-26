# Pstack skills

All 52 skills from `cursor/plugins/pstack/skills` are installed locally in
`.agents/skills`. They were installed with Skills CLI 1.7.2 using:

```sh
npx --yes skills add https://github.com/cursor/plugins/tree/main/pstack/skills --skill '*' --agent codex --copy --yes
```

Run that command in a temporary directory when updating. Compare the installed
files before copying them into this repository so local skills survive updates.
Merge the generated `skills-lock.json` entries with the existing lockfile.

## Local adaptations

Mibba already has its own `tdd` and `teach` skills. The pstack copies are named
`pstack-tdd` and `pstack-teach`; their frontmatter and pstack references use those
names. Preserve these aliases when updating. Their lockfile entries retain the
upstream paths and hashes, which describe the source before local adaptation.

Pstack help links to the upstream README and guide pages because the skills
installer does not include the plugin's sibling documentation directories.
Each skill's own references and playbooks are included locally.

## Using them in Codex

Invoke `architect` to ground a design in existing code and compare interface
sketches. Request a checkpoint explicitly when you want to review the design
before implementation. Skills become available after Codex refreshes its skill
catalog, normally on the next turn.

These are upstream Cursor skills. Cursor model aliases, custom agent types,
Custom Modes and `/loop` require equivalents supported by the current host.
Installing the skills does not configure models or install the full Cursor
plugin. Repository instructions and explicit user choices still take precedence.

Source: <https://github.com/cursor/plugins/tree/main/pstack>.
The upstream MIT license is retained in [pstack-LICENSE](pstack-LICENSE).
