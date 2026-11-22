## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for josephsiefers/ode-examples (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commands

Scripts live in `package.json`. The ones that gate every change:

```sh
npm test                 # vitest, offline (fake LLM); evals are separate and never run here
npm run typecheck
npm run lint             # Oxlint holds every lint rule; Biome's linter is off
npm run format:check     # Biome: formatting + import order. Fix with `npm run format`
```

- Run the CLI as `npm run ladder -- <args>`; the `--` passes args through npm.
- Biome skips Markdown, so the spec and docs keep their hand formatting.
- The CLI loads an optional `.envrc` (see `.envrc.example`), with or without direnv. Tests need no API key.

## Pre-commit hook

Husky runs `.husky/pre-commit` on every commit: the token-size check on staged content, then Biome (writing fixes) on staged files and Oxlint on staged TypeScript (via lint-staged), then a whole-project typecheck. It runs no tests.

- **Never commit with `--no-verify`.** If the hook fails, fix the cause and commit again.
- **When the token check fails**, a staged file is over 5,000 tokens (characters ÷ 4). Follow the splitting advice the message prints, stage the result, and commit again. The check reads the **index**, so `git add` your fix before retrying. Run it by hand with `npm run check-tokens -- --staged` or `npm run check-tokens -- <path>...`.
- Exempt: lockfiles, `.cache/llm/`, `out/`, `reports/`, and binary files.

## Definition of done

`docs/spec/README.md` (Definition of done) is the authoritative list, and every item on it applies to every ticket. One item arrives with a later ticket: `npm run mutate` (#3). Until a ticket's tooling exists, say in the closing comment which items were skipped.
